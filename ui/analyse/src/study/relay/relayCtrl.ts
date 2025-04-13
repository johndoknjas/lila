import type { RelayData, LogEvent, RelaySync, RelayRound, RoundId } from './interfaces';
import type { BothClocks, ChapterId, ChapterSelect, Federations, ServerClockMsg } from '@/study/interfaces';
import type { StudyMemberCtrl } from '@/study/studyMembers';
import type { AnalyseSocketSend } from '@/socket';
import { type Prop, type Toggle, myUserId, notNull, prop, toggle } from 'lib';
import RelayTeams from './relayTeams';
import RelayPlayers from './relayPlayers';
import type { StudyChapters } from '@/study/studyChapters';
import type { MultiCloudEval } from '@/study/multiCloudEval';
import { VideoPlayer } from './videoPlayer';
import RelayStats from './relayStats';
import type AnalyseCtrl from '@/ctrl';
import { LiveboardPlugin } from './liveboardPlugin';
import { pubsub } from 'lib/pubsub';

export const relayTabs = ['overview', 'boards', 'teams', 'players', 'stats'] as const;
export type RelayTab = (typeof relayTabs)[number];
type StreamInfo = [UserId, { name: string; lang: string }];

export default class RelayCtrl {
  log: LogEvent[] = [];
  cooldown = false;
  tourShow: Toggle;
  roundSelectShow = toggle(false);
  groupSelectShow = toggle(false);
  tab: Prop<RelayTab>;
  teams?: RelayTeams;
  players: RelayPlayers;
  stats: RelayStats;
  streams: StreamInfo[] = [];
  showStreamerMenu = toggle(false);
  videoPlayer?: VideoPlayer;
  liveboardPlugin?: LiveboardPlugin;
  readonly baseRedraw: Redraw;
  readonly send: AnalyseSocketSend;

  constructor(
    readonly id: RoundId,
    public data: RelayData,
    analyse: AnalyseCtrl,
    readonly members: StudyMemberCtrl,
    readonly chapters: StudyChapters,
    private readonly multiCloudEval: MultiCloudEval | undefined,
    private readonly federations: () => Federations | undefined,
    chapterSelect: ChapterSelect,
    private readonly updateHistoryAndAddressBar: () => void,
  ) {
    this.tourShow = toggle((location.pathname.split('/broadcast/')[1].match(/\//g) || []).length < 3);
    this.baseRedraw = analyse.redraw;
    this.send = analyse.socket.send;
    if (analyse.opts.chat) {
      this.liveboardPlugin = new LiveboardPlugin(analyse, this.tourShow, chapterSelect.get());
      analyse.opts.chat.plugin = this.liveboardPlugin;
    }

    const locationTab = location.hash.replace(/^#(\w+).*$/, '$1') as RelayTab;
    const initialTab = relayTabs.includes(locationTab)
      ? locationTab
      : this.chapters.looksNew()
        ? 'overview'
        : 'boards';
    this.tab = prop<RelayTab>(initialTab);
    this.teams = data.tour.teamTable
      ? new RelayTeams(id, this.multiCloudEval, chapterSelect, this.roundPath, this.redraw)
      : undefined;
    this.players = new RelayPlayers(
      data.tour.id,
      () => this.openTab('players'),
      analyse.isEmbed,
      this.federations,
      this.redraw,
    );
    this.stats = new RelayStats(this.currentRound(), this.redraw);
    if (data.videoUrls?.[0] || this.isPinnedStreamOngoing())
      this.videoPlayer = new VideoPlayer(
        {
          embed: this.data.videoUrls?.[0] || false,
          redirect: this.data.videoUrls?.[1] || this.data.pinned?.redirect,
          image: this.data.tour.image,
          text: this.data.pinned?.text,
        },
        this.redraw,
      );
    const pinnedName = this.isPinnedStreamOngoing() && data.pinned?.name;
    if (pinnedName) this.streams.push(['ps', { name: pinnedName, lang: '' }]);
    pubsub.on('socket.in.crowd', d => {
      const s = d.streams?.slice() ?? [];
      if (pinnedName) s.unshift(['ps', { name: pinnedName, lang: '' }]);
      if (this.streams.length === s.length && this.streams.every(([id], i) => id === s[i][0])) return;
      this.streams = s;
      this.redraw();
    });
    setInterval(this.baseRedraw, 1000);
  }

  redraw = () => {
    this.baseRedraw();
    this.updateHistoryAndAddressBar();
  };

  openTab = (t: RelayTab) => {
    this.players.closePlayer();
    this.tab(t);
    this.tourShow(true);
    this.redraw();
  };

  onChapterChange = (id: ChapterId) => {
    if (this.tourShow()) {
      this.tourShow(false);
    }
    this.liveboardPlugin?.setChapterId(id);
    this.redraw();
  };

  lastMoveAt = (id: ChapterId): number | undefined => this.chapters.get(id)?.lastMoveAt;

  setSync = (v: boolean) => {
    this.send('relaySync', v);
    this.redraw();
  };

  loading = () => !this.cooldown && this.data.sync?.ongoing;

  setClockToChapterPreview = (msg: ServerClockMsg, clocks: BothClocks) => {
    const cp = this.chapters.get(msg.p.chapterId);
    if (cp?.players)
      ['white', 'black'].forEach((color: Color, i) => {
        const clock = clocks[i];
        if (notNull(clock)) cp.players![color].clock = clock;
      });
  };

  roundById = (id: string) => this.data.rounds.find(r => r.id === id);
  currentRound = () => this.roundById(this.id)!;
  roundName = () => this.currentRound().name;

  fullRoundName = () => `${this.data.tour.name} - ${this.roundName()}`;

  tourPath = () => `/broadcast/${this.data.tour.slug}/${this.data.tour.id}`;
  roundPath = (round?: RelayRound) => {
    const r = round || this.currentRound();
    return `/broadcast/${this.data.tour.slug}/${r.slug}/${r.id}`;
  };
  roundUrlWithHash = (round?: RelayRound) => `${this.roundPath(round)}#${this.tab()}`;
  updateAddressBar = (tourUrl: string, roundUrl: string) => {
    const tab = this.tab();
    const tabHash = () => (tab === 'overview' ? '' : tab === 'players' ? this.players.tabHash() : `#${tab}`);
    const url = this.tourShow() ? `${tourUrl}${tabHash()}` : roundUrl;
    // when jumping from a tour tab to another page, remember which tour tab we were on.
    if (!this.tourShow() && location.href.includes('#')) history.pushState({}, '', url);
    else history.replaceState({}, '', url);
  };

  isOfficial = () => !!this.data.tour.tier;

  isStreamer = () => this.streams.some(([id]) => id === myUserId());

  isPinnedStreamOngoing = () => {
    if (!this.data.pinned) return false;
    if (this.currentRound().finished) return false;
    if (Date.now() < this.currentRound().startsAt! - 1000 * 3600) return false;
    return true;
  };

  noEmbed() {
    return document.cookie.includes('relayVideo=no');
  }

  private socketHandlers = {
    relayData: (d: RelayData) => {
      if (d.sync) d.sync.log = this.data.sync?.log || [];
      this.data = d;
      this.redraw();
    },
    relaySync: (sync: RelaySync) => {
      this.data.sync = {
        ...sync,
        log: this.data.sync?.log || sync.log,
      };
      this.redraw();
    },
    relayLog: (event: LogEvent) => {
      if (!this.data.sync) return;
      this.data.sync.log.push(event);
      this.data.sync.log = this.data.sync.log.slice(-20);
      this.cooldown = true;
      setTimeout(() => {
        this.cooldown = false;
        this.redraw();
      }, 4500);
      this.redraw();
    },
  };

  socketHandler = (t: string, d: any): boolean => {
    const handler = (this.socketHandlers as SocketHandlers)[t];
    if (handler && d.id === this.id) {
      handler(d);
      return true;
    }
    return false;
  };
}
