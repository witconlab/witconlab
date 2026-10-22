// 새나가온 캐릭터: 회원들이 만든 감정 주사위 표정과 토끼 손인형을 단순한 도형으로 다시 그렸어요.
(() => {
  const INK = '#2a2140';

  // 감정 주사위 한 면: expr = smile | wow | tongue | grr | wink | joy
  function dice({ x = 0, y = 0, size = 100, color = '#9ed3f2', expr = 'smile', rot = 0 } = {}) {
    const s = size, h = s / 2, e = s * 0.09;
    const eyeY = -s * 0.1, eyeX = s * 0.2;
    const eye = (cx, open = true) => open
      ? `<circle cx="${cx}" cy="${eyeY}" r="${e}" fill="#fff" stroke="${INK}" stroke-width="${s * 0.025}"/><circle cx="${cx + e * 0.25}" cy="${eyeY + e * 0.15}" r="${e * 0.5}" fill="${INK}"/>`
      : `<path d="M${cx - e} ${eyeY + e * 0.2} q${e} ${-e * 1.2} ${e * 2} 0" fill="none" stroke="${INK}" stroke-width="${s * 0.035}" stroke-linecap="round"/>`;
    const sw = s * 0.035;
    const mouths = {
      smile: `<path d="M${-s * 0.16} ${s * 0.13} q${s * 0.16} ${s * 0.16} ${s * 0.32} 0" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round"/>`,
      wow: `<ellipse cx="0" cy="${s * 0.2}" rx="${s * 0.08}" ry="${s * 0.11}" fill="#c9374f" stroke="${INK}" stroke-width="${sw * 0.7}"/>`,
      tongue: `<path d="M${-s * 0.15} ${s * 0.14} h${s * 0.3}" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round"/><path d="M${s * 0.02} ${s * 0.14} q${s * 0.06} ${s * 0.16} ${s * 0.12} 0" fill="#f07a9a" stroke="${INK}" stroke-width="${sw * 0.7}"/>`,
      grr: `<rect x="${-s * 0.16}" y="${s * 0.1}" width="${s * 0.32}" height="${s * 0.13}" rx="${s * 0.03}" fill="#fff" stroke="${INK}" stroke-width="${sw * 0.8}"/><path d="M${-s * 0.08} ${s * 0.1} v${s * 0.13} M0 ${s * 0.1} v${s * 0.13} M${s * 0.08} ${s * 0.1} v${s * 0.13}" stroke="${INK}" stroke-width="${sw * 0.5}"/>`,
      wink: `<path d="M${-s * 0.14} ${s * 0.13} q${s * 0.14} ${s * 0.13} ${s * 0.28} 0" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round"/>`,
      joy: `<path d="M${-s * 0.17} ${s * 0.1} h${s * 0.34} q0 ${s * 0.2} ${-s * 0.17} ${s * 0.2} q${-s * 0.17} 0 ${-s * 0.17} ${-s * 0.2}z" fill="#c9374f" stroke="${INK}" stroke-width="${sw * 0.7}" stroke-linejoin="round"/>`
    };
    const brows = expr === 'grr'
      ? `<path d="M${-eyeX - e * 1.2} ${eyeY - e * 2} l${e * 2.2} ${e * 0.9} M${eyeX + e * 1.2} ${eyeY - e * 2} l${-e * 2.2} ${e * 0.9}" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round"/>`
      : '';
    const eyes = expr === 'wink' ? eye(-eyeX) + eye(eyeX, false)
      : expr === 'joy' ? eye(-eyeX, false) + eye(eyeX, false)
      : eye(-eyeX) + eye(eyeX);
    const cheeks = expr === 'grr' ? '' :
      `<circle cx="${-s * 0.3}" cy="${s * 0.1}" r="${s * 0.05}" fill="#f28fb0" opacity=".55"/><circle cx="${s * 0.3}" cy="${s * 0.1}" r="${s * 0.05}" fill="#f28fb0" opacity=".55"/>`;
    return `<g transform="translate(${x} ${y}) rotate(${rot})">
      <rect x="${-h}" y="${-h}" width="${s}" height="${s}" rx="${s * 0.2}" fill="${color}" stroke="${INK}" stroke-width="${s * 0.03}"/>
      ${brows}${eyes}${cheeks}${mouths[expr] || mouths.smile}
    </g>`;
  }

  // 토끼 손인형 (물방울무늬 귀, 오리 무늬 소매)
  function rabbit({ x = 0, y = 0, size = 160, rot = 0, holding = '' } = {}) {
    const k = size / 160;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k})">
      <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
        <path d="M-34 -40 C-52 -110 -40 -150 -22 -150 C-6 -150 -6 -100 -12 -44z" fill="#fff"/>
        <path d="M34 -40 C52 -110 40 -150 22 -150 C6 -150 6 -100 12 -44z" fill="#fff"/>
        <path d="M-27 -60 C-38 -105 -32 -134 -22 -134 C-13 -134 -14 -100 -17 -60z" fill="#f6a6c4" stroke="none"/>
        <path d="M27 -60 C38 -105 32 -134 22 -134 C13 -134 14 -100 17 -60z" fill="#f6a6c4" stroke="none"/>
        <path d="M-48 40 L-56 120 H56 L48 40z" fill="#fde7a5"/>
        <ellipse cx="0" cy="0" rx="58" ry="52" fill="#fff"/>
      </g>
      <g fill="#fff"><circle cx="-26" cy="-122" r="3.5"/><circle cx="-30" cy="-96" r="3"/><circle cx="25" cy="-118" r="3.5"/><circle cx="30" cy="-90" r="3"/></g>
      <g fill="#f2b632"><circle cx="-30" cy="80" r="6"/><circle cx="0" cy="100" r="6"/><circle cx="28" cy="74" r="6"/><circle cx="-12" cy="62" r="5"/><circle cx="30" cy="104" r="5"/></g>
      <path d="M-30 -6 q8 -9 16 0 M14 -6 q8 -9 16 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="-34" cy="12" r="8" fill="#f28fb0" opacity=".6"/><circle cx="34" cy="12" r="8" fill="#f28fb0" opacity=".6"/>
      <path d="M-5 10 l5 5 l5 -5" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${holding}
    </g>`;
  }

  // 책상자: 토끼가 들고 있는 상자
  function bookbox({ x = 0, y = 0, w = 120, h = 80 } = {}) {
    return `<g transform="translate(${x} ${y})" stroke="${INK}" stroke-width="4" stroke-linejoin="round">
      <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="8" fill="#d9a46a"/>
      <path d="M${-w / 2} ${-h / 2 + 18} H${w / 2}" />
      <rect x="${-w / 2 + 14}" y="${-h / 2 - 26}" width="22" height="34" rx="3" fill="#6b3fb0" transform="rotate(-8 ${-w / 2 + 25} ${-h / 2 - 9})"/>
      <rect x="${-w / 2 + 40}" y="${-h / 2 - 32}" width="22" height="40" rx="3" fill="#4aa3df"/>
      <rect x="${-w / 2 + 66}" y="${-h / 2 - 24}" width="22" height="32" rx="3" fill="#e5458f" transform="rotate(7 ${-w / 2 + 77} ${-h / 2 - 8})"/>
      <text x="0" y="${h / 2 - 16}" text-anchor="middle" font-family="'Black Han Sans', sans-serif" font-size="22" fill="${INK}" stroke="none">책상자</text>
    </g>`;
  }

  const svg = (viewBox, body, label) =>
    `<svg viewBox="${viewBox}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

  window.SAENAGAON_CHARS = {
    // 홈 첫 화면: 주사위 친구들과 토끼
    hero: () => svg('0 0 720 330', `
      ${dice({ x: 96, y: 210, size: 104, color: '#9ed3f2', expr: 'smile', rot: -12 })}
      ${dice({ x: 205, y: 96, size: 86, color: '#ffd166', expr: 'tongue', rot: 10 })}
      ${dice({ x: 236, y: 250, size: 96, color: '#b9a3f0', expr: 'wow', rot: 6 })}
      ${rabbit({ x: 368, y: 196, size: 190, rot: -3 })}
      ${dice({ x: 506, y: 108, size: 92, color: '#f7a8c8', expr: 'joy', rot: -8 })}
      ${dice({ x: 520, y: 256, size: 98, color: '#8fd6a8', expr: 'wink', rot: 9 })}
      ${dice({ x: 636, y: 190, size: 84, color: '#f4a582', expr: 'grr', rot: -6 })}
    `, '새나가온 캐릭터: 표정이 다른 감정 주사위들과 토끼 손인형'),
    // 로고용 작은 주사위
    logo: () => svg('-55 -55 110 110', dice({ size: 96, color: '#b9a3f0', expr: 'joy', rot: -8 }), '새나가온'),
    // 책상자를 든 토끼
    bookbox: () => svg('0 0 340 300', `
      ${rabbit({ x: 170, y: 180, size: 200 })}
      ${bookbox({ x: 170, y: 246, w: 150, h: 84 })}
      ${dice({ x: 54, y: 230, size: 64, color: '#ffd166', expr: 'smile', rot: -10 })}
      ${dice({ x: 290, y: 214, size: 58, color: '#9ed3f2', expr: 'wink', rot: 12 })}
    `, '책상자를 든 토끼 손인형'),
    // 빈 화면용 작은 친구 한 명
    single: (expr = 'smile', color = '#9ed3f2') =>
      svg('-55 -55 110 110', dice({ size: 96, color, expr, rot: -6 }), '감정 주사위 캐릭터')
  };
})();
