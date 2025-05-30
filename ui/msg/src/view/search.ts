import { h, type VNode } from 'snabbdom';
import { throttle } from 'lib/async';
import type MsgCtrl from '../ctrl';
import type { SearchResult, User } from '../interfaces';
import renderContacts, { userIcon } from './contact';
import { fullName } from 'lib/view/userLink';
import { hookMobileMousedown } from 'lib/device';

export const renderInput = (ctrl: MsgCtrl): VNode =>
  h('div.msg-app__side__search', [
    h('input', {
      attrs: { value: '', placeholder: i18n.site.searchOrStartNewDiscussion },
      hook: {
        insert(vnode) {
          const input = vnode.elm as HTMLInputElement;
          input.addEventListener(
            'input',
            throttle(500, () => ctrl.searchInput(input.value.trim())),
          );
          input.addEventListener('blur', () =>
            setTimeout(() => {
              input.value = '';
              ctrl.searchInput('');
            }, 500),
          );
        },
      },
    }),
  ]);

export function renderResults(ctrl: MsgCtrl, res: SearchResult): VNode {
  return h('div.msg-app__search.msg-app__side__content', [
    res.contacts[0] &&
      h('section', [
        h('h2', i18n.site.discussions),
        h(
          'div.msg-app__search__contacts',
          res.contacts.map(t => renderContacts(ctrl, t)),
        ),
      ]),
    res.friends[0] &&
      h('section', [
        h('h2', i18n.site.friends),
        h(
          'div.msg-app__search__users',
          res.friends.map(u => renderUser(ctrl, u)),
        ),
      ]),
    res.users[0] &&
      h('section', [
        h('h2', i18n.site.players),
        h(
          'div.msg-app__search__users',
          res.users.map(u => renderUser(ctrl, u)),
        ),
      ]),
  ]);
}

function renderUser(ctrl: MsgCtrl, user: User): VNode {
  return h(
    'div.msg-app__side__contact',
    { key: user.id, hook: hookMobileMousedown(_ => ctrl.openConvo(user.id)) },
    [
      userIcon(user, 'msg-app__side__contact__icon'),
      h('div.msg-app__side__contact__user', [
        h('div.msg-app__side__contact__head', [h('div.msg-app__side__contact__name', fullName(user))]),
      ]),
    ],
  );
}
