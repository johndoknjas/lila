import * as licon from 'lib/licon';
import { type VNode, bind, onInsert, looseH as h } from 'lib/snabbdom';
import type AnalyseCtrl from '../ctrl';
import * as studyView from '../study/studyView';
import { patch, nodeFullName } from '../view/util';
import { renderVariationPgn } from '../pgnExport';

export interface Opts {
  path: Tree.Path;
  root: AnalyseCtrl;
}

interface Coords {
  x: number;
  y: number;
}

interface PageOrClientPos {
  pageX?: number;
  pageY?: number;
  clientX?: number;
  clientY?: number;
}

const elementId = 'analyse-cm';

function getPosition(e: MouseEvent | TouchEvent): Coords | null {
  let pos = e as PageOrClientPos;
  if ('touches' in e && e.touches.length > 0) pos = e.touches[0];
  if (pos.pageX || pos.pageY) return { x: pos.pageX!, y: pos.pageY! };
  else if (pos.clientX || pos.clientY)
    return {
      x: pos.clientX! + document.body.scrollLeft + document.documentElement.scrollLeft,
      y: pos.clientY! + document.body.scrollTop + document.documentElement.scrollTop,
    };
  else return null;
}

function positionMenu(menu: HTMLElement, coords: Coords): void {
  const menuWidth = menu.offsetWidth + 4,
    menuHeight = menu.offsetHeight + 4,
    windowWidth = window.innerWidth,
    windowHeight = window.innerHeight;

  menu.style.left =
    windowWidth - coords.x < menuWidth ? windowWidth - menuWidth + 'px' : (menu.style.left = coords.x + 'px');

  menu.style.top =
    windowHeight - coords.y < menuHeight
      ? windowHeight - menuHeight + 'px'
      : (menu.style.top = coords.y + 'px');
}

function action(icon: string, text: string, handler: () => void): VNode {
  return h('a', { attrs: { 'data-icon': icon }, hook: bind('click', handler) }, text);
}

function view(opts: Opts, coords: Coords): VNode {
  const ctrl = opts.root,
    node = ctrl.tree.nodeAtPath(opts.path),
    onMainline = ctrl.tree.pathIsMainline(opts.path) && !ctrl.tree.pathIsForcedVariation(opts.path);
  return h(
    'div#' + elementId + '.visible',
    {
      hook: {
        ...onInsert(elm => {
          elm.addEventListener('contextmenu', e => (e.preventDefault(), false));
          positionMenu(elm, coords);
        }),
        postpatch: (_, vnode) => positionMenu(vnode.elm as HTMLElement, coords),
      },
    },
    [
      h('p.title', nodeFullName(node)),

      !onMainline &&
        action(licon.UpTriangle, i18n.site.promoteVariation, () => ctrl.promote(opts.path, false)),

      !onMainline && action(licon.Checkmark, i18n.site.makeMainLine, () => ctrl.promote(opts.path, true)),

      action(licon.Trash, i18n.site.deleteFromHere, () => ctrl.deleteNode(opts.path)),

      action(licon.PlusButton, i18n.site.expandVariations, () => ctrl.setAllCollapsed(opts.path, false)),

      action(licon.MinusButton, i18n.site.collapseVariations, () => ctrl.setAllCollapsed(opts.path, true)),

      ...(ctrl.study ? studyView.contextMenu(ctrl.study, opts.path, node) : []),

      onMainline &&
        action(licon.InternalArrow, i18n.site.forceVariation, () => ctrl.forceVariation(opts.path, true)),

      action(licon.Clipboard, onMainline ? i18n.site.copyMainLinePgn : i18n.site.copyVariationPgn, () =>
        navigator.clipboard.writeText(
          renderVariationPgn(opts.root.data.game, opts.root.tree.getNodeList(opts.path), onMainline),
        ),
      ),
    ],
  );
}

export default function (e: MouseEvent, opts: Opts): void {
  let pos = getPosition(e);
  if (pos === null) {
    if (opts.root.contextMenuPath) return;
    pos = { x: 0, y: 0 };
  }

  const el = ($('#' + elementId)[0] ||
    $('<div id="' + elementId + '">').appendTo($('body'))[0]) as HTMLElement;
  opts.root.contextMenuPath = opts.path;
  function close(e: MouseEvent) {
    if (e.button === 2) return; // right click
    opts.root.contextMenuPath = undefined;
    document.removeEventListener('click', close, false);
    $('#' + elementId).removeClass('visible');
    opts.root.redraw();
  }
  document.addEventListener('click', close, false);
  el.innerHTML = '';
  patch(el, view(opts, pos));
}
