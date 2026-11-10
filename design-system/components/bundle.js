/* @ds-bundle: {"format":4,"namespace":"Kiosk","components":[{"name":"Icon"},{"name":"Button"},{"name":"IconButton"},{"name":"TextField"},{"name":"Chip"},{"name":"Notice"},{"name":"Spinner"},{"name":"CreditBadge"},{"name":"AppHeader"},{"name":"ToolShape"},{"name":"Highlight"},{"name":"ModeCard"},{"name":"ConversationItem"},{"name":"ChatMessage"},{"name":"Composer"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) out.push(arguments[i]);
    return out.join(' ');
  }
  function omit(obj, keys) {
    var out = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) out[k] = obj[k];
    return out;
  }

  // 24px grid, 2px stroke, round caps. p = path, c = circle, r = rect.
  var ICONS = {
    chat: [['p', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z']],
    image: [['r', 3, 3, 18, 18, 3], ['c', 9, 9, 2], ['p', 'M21 15l-5-5L5 21']],
    music: [['p', 'M9 18V5l12-2v13'], ['c', 6, 18, 3], ['c', 18, 16, 3]],
    video: [['r', 2, 6, 14, 12, 2], ['p', 'M16 10l6-4v12l-6-4z']],
    code: [['p', 'M8 6l-6 6 6 6'], ['p', 'M16 6l6 6-6 6']],
    send: [['p', 'M12 19V5'], ['p', 'M5 12l7-7 7 7']],
    stop: [['r', 6, 6, 12, 12, 2]],
    plus: [['p', 'M12 5v14'], ['p', 'M5 12h14']],
    back: [['p', 'M19 12H5'], ['p', 'M12 19l-7-7 7-7']],
    home: [['p', 'M3 11l9-8 9 8'], ['p', 'M5 10v10h14V10']],
    user: [['c', 12, 8, 4], ['p', 'M4 21a8 8 0 0 1 16 0']],
    credits: [['c', 12, 12, 9], ['c', 12, 12, 4]],
    sun: [['c', 12, 12, 4], ['p', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4']],
    moon: [['p', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z']],
    signout: [['p', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'], ['p', 'M16 17l5-5-5-5'], ['p', 'M21 12H9']],
    copy: [['r', 9, 9, 12, 12, 2], ['p', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1']],
    download: [['p', 'M12 3v12'], ['p', 'M7 10l5 5 5-5'], ['p', 'M5 21h14']],
    help: [['c', 12, 12, 9], ['p', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3'], ['p', 'M12 17h.01']],
    check: [['p', 'M5 12.5l4.5 4.5L19 7']],
    alert: [['c', 12, 12, 9], ['p', 'M12 7v6'], ['p', 'M12 16.5h.01']],
    menu: [['p', 'M4 6h16M4 12h16M4 18h16']],
    close: [['p', 'M6 6l12 12M18 6L6 18']]
  };

  function Icon(props) {
    var spec = ICONS[props.name] || [];
    var size = props.size || 24;
    var kids = spec.map(function (s, i) {
      if (s[0] === 'p') return h('path', { key: i, d: s[1] });
      if (s[0] === 'c') return h('circle', { key: i, cx: s[1], cy: s[2], r: s[3] });
      return h('rect', { key: i, x: s[1], y: s[2], width: s[3], height: s[4], rx: s[5] });
    });
    return h('svg', {
      className: cx('lk-icon', props.className),
      width: size, height: size, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', strokeWidth: 2,
      strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': props.label ? undefined : 'true',
      'aria-label': props.label, role: props.label ? 'img' : undefined
    }, kids);
  }
  Icon.names = Object.keys(ICONS);

  function Button(props) {
    var variant = props.variant || 'secondary';
    var rest = omit(props, ['variant', 'size', 'icon', 'iconEnd', 'block', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('lk-btn', 'lk-btn--' + variant, props.size === 'lg' && 'lk-btn--lg', props.block && 'lk-btn--block', props.className)
    }),
      props.icon ? h(Icon, { name: props.icon, size: 22 }) : null,
      h('span', null, props.children),
      props.iconEnd ? h(Icon, { name: props.iconEnd, size: 22 }) : null
    );
  }

  function IconButton(props) {
    var rest = omit(props, ['icon', 'label', 'variant', 'size', 'className']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('lk-iconbtn', 'lk-iconbtn--' + (props.variant || 'quiet'), props.size === 'lg' && 'lk-iconbtn--lg', props.className),
      'aria-label': props.label, title: props.label
    }), h(Icon, { name: props.icon }));
  }

  var fieldSeq = 0;
  function TextField(props) {
    var idRef = React.useRef(null);
    if (!idRef.current) idRef.current = props.id || 'lk-field-' + (++fieldSeq);
    var id = idRef.current;
    var rest = omit(props, ['label', 'hint', 'error', 'multiline', 'className', 'id']);
    var describedBy = props.error ? id + '-err' : props.hint ? id + '-hint' : undefined;
    var control = h(props.multiline ? 'textarea' : 'input', Object.assign({}, rest, {
      id: id, className: 'lk-field__control', 'aria-invalid': props.error ? 'true' : undefined, 'aria-describedby': describedBy
    }));
    return h('div', { className: cx('lk-field', props.error && 'lk-field--error', props.className) },
      h('label', { className: 'lk-field__label', htmlFor: id }, props.label),
      control,
      props.error
        ? h('p', { className: 'lk-field__error', id: id + '-err' }, h(Icon, { name: 'alert', size: 20 }), props.error)
        : props.hint ? h('p', { className: 'lk-field__hint', id: id + '-hint' }, props.hint) : null
    );
  }

  function Chip(props) {
    var rest = omit(props, ['icon', 'selected', 'className', 'children']);
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('lk-chip', props.selected && 'lk-chip--selected', props.className),
      'aria-pressed': props.selected === undefined ? undefined : !!props.selected
    }), props.icon ? h(Icon, { name: props.icon, size: 20 }) : null, props.children);
  }

  var NOTICE_ICON = { info: 'help', success: 'check', warning: 'alert', danger: 'alert' };
  function Notice(props) {
    var tone = props.tone || 'info';
    return h('div', { className: cx('lk-notice', 'lk-notice--' + tone, props.className), role: tone === 'danger' ? 'alert' : 'status' },
      h(Icon, { name: NOTICE_ICON[tone], className: 'lk-notice__icon' }),
      h('div', { className: 'lk-notice__body' },
        props.title ? h('p', { className: 'lk-notice__title' }, props.title) : null,
        props.children ? h('div', { className: 'lk-notice__text' }, props.children) : null
      ),
      props.action || null
    );
  }

  function Spinner(props) {
    return h('span', { className: cx('lk-spinner-wrap', props.className), role: 'status' },
      h('span', { className: 'lk-spinner', 'aria-hidden': 'true', style: props.size ? { width: props.size, height: props.size } : undefined }),
      props.label ? h('span', { className: 'lk-spinner__label' }, props.label) : h('span', { className: 'lk-sr' }, 'Loading')
    );
  }

  function CreditBadge(props) {
    var low = props.credits <= (props.lowAt == null ? 5 : props.lowAt);
    return h('span', {
      className: cx('lk-credits', low && 'lk-credits--low', props.className),
      title: props.renewsAt ? 'Credits renew ' + props.renewsAt : undefined
    },
      low ? h(Icon, { name: 'alert', size: 20 }) : h('span', { className: 'lk-coin', 'aria-hidden': 'true' }),
      h('span', null, h('strong', null, props.credits), ' credits', low ? ' left' : '')
    );
  }

  // Solid shape art for each tool. Drawn on a 120 grid; meant to run off a tile's corner.
  var TOOL_SHAPES = {
    chat: function () { return [h('path', { key: 1, className: 'lk-fill-main', d: 'M24 12h76a16 16 0 0 1 16 16v46a16 16 0 0 1-16 16H54l-28 24V90h-2A16 16 0 0 1 8 74V28a16 16 0 0 1 16-16z' })]; },
    image: function () { return [h('circle', { key: 1, className: 'lk-fill-main', cx: 80, cy: 40, r: 24 }), h('path', { key: 2, className: 'lk-fill-ink', d: 'M0 120a60 60 0 0 1 120 0z' })]; },
    music: function () { return [h('circle', { key: 1, className: 'lk-fill-main', cx: 0, cy: 120, r: 30 }), h('circle', { key: 2, className: 'lk-stroke-main', cx: 0, cy: 120, r: 62, strokeWidth: 16, fill: 'none' }), h('circle', { key: 3, className: 'lk-stroke-main', cx: 0, cy: 120, r: 98, strokeWidth: 16, fill: 'none' })]; },
    video: function () { return [h('path', { key: 1, className: 'lk-fill-main lk-stroke-main', d: 'M36 22L100 60L36 98Z', strokeWidth: 18, strokeLinejoin: 'round' })]; },
    code: function () { return [h('path', { key: 1, className: 'lk-fill-main', d: 'M14 14l92 30v20l-92 30V74l62-20-62-20z' }), h('rect', { key: 2, className: 'lk-fill-main', x: 14, y: 100, width: 92, height: 18 })]; }
  };
  function ToolShape(props) {
    var draw = TOOL_SHAPES[props.tool] || TOOL_SHAPES.chat;
    var size = props.size || 120;
    return h('svg', {
      className: cx('lk-shape', 'lk-tool--' + (props.tool || 'chat'), props.className),
      width: size, height: size, viewBox: '0 0 120 120', 'aria-hidden': 'true'
    }, draw());
  }

  function Highlight(props) {
    return h('span', { className: cx('lk-highlight', props.className) }, props.children);
  }

  function AppHeader(props) {
    var theme = props.theme || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme'));
    var dark = theme === 'dark';
    return h('header', { className: 'lk-header' },
      h('div', { className: 'lk-header__start' },
        props.logoSrc ? h('span', { className: 'lk-header__logo' },
          h('img', { src: props.logoSrc, alt: 'Public AI Libraries Project' })
        ) : null,
        props.onBack ? h(Button, { variant: 'quiet', icon: 'back', className: 'lk-header__home', onClick: props.onBack }, 'Home') : null
      ),
      h('div', { className: 'lk-header__end' },
        props.title ? h('span', { className: 'lk-header__title' }, props.tool ? h(ToolShape, { tool: props.tool, size: 28 }) : null, props.title) : null,
        props.children,
        props.credits != null ? h(CreditBadge, { credits: props.credits, renewsAt: props.renewsAt }) : null,
        props.onAccount ? h(Button, { variant: 'quiet', icon: 'user', onClick: props.onAccount }, 'Account') : null,
        props.onToggleTheme ? h(Button, { variant: 'quiet', icon: dark ? 'sun' : 'moon', onClick: props.onToggleTheme }, dark ? 'Light' : 'Dark') : null,
        props.onSignOut ? h(Button, { variant: 'secondary', icon: 'signout', onClick: props.onSignOut }, props.signOutLabel || 'Sign out') : null
      )
    );
  }

  function ModeCard(props) {
    var tag = props.href ? 'a' : 'button';
    var tool = props.tool || 'chat';
    var attrs = { className: cx('lk-mode', 'lk-tool--' + tool, props.hero && 'lk-mode--hero', props.className), onClick: props.onClick };
    if (props.href) attrs.href = props.href; else attrs.type = 'button';
    return h(tag, attrs,
      h('span', { className: 'lk-mode__text' },
        h('span', { className: 'lk-mode__title' }, props.title),
        h('span', { className: 'lk-mode__desc' }, props.description),
        props.cost ? h('span', { className: 'lk-mode__cost' }, props.cost) : null
      ),
      h(ToolShape, { tool: tool, size: props.hero ? 240 : 100, className: 'lk-mode__shape' })
    );
  }

  function ConversationItem(props) {
    return h('button', {
      type: 'button', onClick: props.onClick,
      className: cx('lk-convo', props.selected && 'lk-convo--selected', props.className),
      'aria-current': props.selected ? 'true' : undefined
    },
      props.icon ? h(Icon, { name: props.icon, size: 20, className: 'lk-convo__icon' }) : null,
      h('span', { className: 'lk-convo__text' },
        h('span', { className: 'lk-convo__title' }, props.title),
        props.meta ? h('span', { className: 'lk-convo__meta' }, props.meta) : null
      )
    );
  }

  function ChatMessage(props) {
    var role = props.role || 'assistant';
    if (props.thinking) {
      return h('div', { className: 'lk-msg lk-msg--assistant' }, h(Spinner, { label: props.thinking === true ? 'Thinking…' : props.thinking }));
    }
    return h('div', { className: cx('lk-msg', 'lk-msg--' + role, props.className) },
      h('div', { className: 'lk-msg__body' }, props.children),
      role === 'assistant' && props.actions ? h('div', { className: 'lk-msg__actions' }, props.actions) : null,
      props.time ? h('div', { className: 'lk-msg__time' }, props.time) : null
    );
  }

  function Composer(props) {
    var controlled = props.value !== undefined;
    var st = React.useState(props.defaultValue || '');
    var value = controlled ? props.value : st[0];
    var ref = React.useRef(null);
    function setValue(v) { if (!controlled) st[1](v); if (props.onChange) props.onChange(v); }
    React.useEffect(function () {
      var el = ref.current; if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 6 * 30 + 24) + 'px';
    }, [value]);
    function send() {
      if (props.busy || !value.trim()) return;
      if (props.onSend) props.onSend(value.trim());
      setValue('');
    }
    var empty = !value.trim();
    return h('div', { className: cx('lk-composer-wrap', props.className) },
      h('form', { className: 'lk-composer', onSubmit: function (e) { e.preventDefault(); send(); } },
        h('label', { className: 'lk-sr', htmlFor: props.id || 'lk-composer' }, props.label || 'Message'),
        h('textarea', {
          id: props.id || 'lk-composer', ref: ref, rows: 1, value: value,
          placeholder: props.placeholder || 'Type your message…',
          className: 'lk-composer__input',
          onChange: function (e) { setValue(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
        }),
        props.busy
          ? h(IconButton, { icon: 'stop', label: 'Stop', variant: 'primary', size: 'lg', onClick: props.onStop })
          : h(IconButton, { icon: 'send', label: 'Send message', variant: 'primary', size: 'lg', type: 'submit', disabled: empty })
      ),
      props.hint === false ? null : h('p', { className: 'lk-composer__hint' }, props.hint || 'Press Enter to send. Shift + Enter for a new line.')
    );
  }

  window.Kiosk = Object.assign(window.Kiosk || {}, {
    Icon: Icon, Button: Button, IconButton: IconButton, TextField: TextField, Chip: Chip,
    Notice: Notice, Spinner: Spinner, CreditBadge: CreditBadge, AppHeader: AppHeader,
    ToolShape: ToolShape, Highlight: Highlight, ModeCard: ModeCard, ConversationItem: ConversationItem, ChatMessage: ChatMessage, Composer: Composer
  });
})();
