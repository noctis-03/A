/**
 * 웍웍! 아이콘 (스티커형): 64×64 그리드, 3px 진한 갈색 외곽선, 평면 2톤 + 흰 하이라이트.
 * 디자인 캔버스 "07 아이콘 · 재료" / "08 아이콘 · 상황" 과 같은 도형.
 * ic-<재료 id> : 재료 10종 · u-<이름> : 상황 아이콘 14종
 */
const SPRITE = `
<symbol id="ic-rice" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M11 33 C11 20 20 12 32 12 C44 12 53 20 53 33 Z" style="fill: var(--lf, #FFF8EC)"/>
          <ellipse cx="22" cy="25" rx="2.6" ry="1.6" style="fill: var(--lf, #E3D6BA); stroke: none"/>
          <ellipse cx="34" cy="20" rx="2.6" ry="1.6" style="fill: var(--lf, #E3D6BA); stroke: none"/>
          <ellipse cx="42" cy="27" rx="2.6" ry="1.6" style="fill: var(--lf, #E3D6BA); stroke: none"/>
          <ellipse cx="30" cy="28" rx="2.6" ry="1.6" style="fill: var(--lf, #E3D6BA); stroke: none"/>
          <path d="M8 33 H56 C56 46 46 55 32 55 C18 55 8 46 8 33 Z" style="fill: var(--lf, #E5482C)"/>
          <path d="M14 41 H50" style="fill: none; stroke: var(--lh2, #FFB547); stroke-width: 2.5"/>
          <path d="M19 21 C21 17 25 15 29 14" style="fill: none; stroke: var(--lh, #FFFFFF); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-scallion" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <g transform="rotate(-24 30 32)">
            <rect x="22" y="30" width="13" height="26" rx="6.5" style="fill: var(--lf, #F3F7E6)"/>
            <rect x="22" y="6" width="13" height="30" rx="6.5" style="fill: var(--lf, #58B54A)"/>
            <path d="M26 12 V28" style="fill: none; stroke: var(--lh, #B6E39A); stroke-width: 2.5"/>
          </g>
          <circle cx="47" cy="47" r="10" style="fill: var(--lf, #CDEBB5)"/>
          <circle cx="47" cy="47" r="4.5" style="fill: var(--lf, #7CC25A)"/>
        </g>
      </symbol>
      <symbol id="ic-egg" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M33 9 C45 9 56 17 55 30 C54 44 45 55 31 55 C18 55 9 47 9 35 C9 22 20 9 33 9 Z" style="fill: var(--lf, #FFFDF5)"/>
          <circle cx="31" cy="33" r="11" style="fill: var(--lf, #FFC93A)"/>
          <path d="M25 30 C26 27 28 25 31 25" style="fill: none; stroke: var(--lh, #FFFFFF); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-kimchi" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M12 52 C8 38 13 22 25 14 C34 8 46 9 53 16 C48 19 53 24 48 28 C53 32 46 36 49 41 C40 48 27 54 12 52 Z" style="fill: var(--lf, #E2452F)"/>
          <path d="M12 52 C19 45 30 35 45 23 C41 33 31 44 22 53 Z" style="fill: var(--lf, #FBE3C8)"/>
          <path d="M30 18 C36 15 42 15 46 17" style="fill: none; stroke: var(--lh, #FF9A7A); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-ham" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M10 22 L32 33 L32 56 L10 45 Z" style="fill: var(--lf, #E98A86)"/>
          <path d="M54 22 L32 33 L32 56 L54 45 Z" style="fill: var(--lf, #D46B69)"/>
          <path d="M32 10 L54 22 L32 33 L10 22 Z" style="fill: var(--lf, #F7B6B0)"/>
          <ellipse cx="26" cy="20" rx="3" ry="1.8" style="fill: var(--lf, #FFE3E0); stroke: none"/>
          <ellipse cx="37" cy="23" rx="2.4" ry="1.4" style="fill: var(--lf, #FFE3E0); stroke: none"/>
          <ellipse cx="33" cy="16" rx="2" ry="1.2" style="fill: var(--lf, #FFE3E0); stroke: none"/>
        </g>
      </symbol>
      <symbol id="ic-onion" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M32 6 C31 9 31 11 32 13" style="fill: none"/>
          <path d="M32 13 C42 23 53 29 53 41 C53 51 44 57 32 57 C20 57 11 51 11 41 C11 29 22 23 32 13 Z" style="fill: var(--lf, #F4EFE2)"/>
          <path d="M32 17 C25 27 23 42 28 56" style="fill: none; stroke: var(--ls, #C9A86E); stroke-width: 2"/>
          <path d="M32 17 C39 27 41 42 36 56" style="fill: none; stroke: var(--ls, #C9A86E); stroke-width: 2"/>
          <path d="M18 34 C17 38 17 42 18 46" style="fill: none; stroke: var(--lh, #FFFFFF); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-carrot" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M44 19 C46 10 52 5 59 6 C57 13 52 17 46 21 Z" style="fill: var(--lf, #58B54A)"/>
          <path d="M43 19 C40 11 42 5 47 2 C50 8 49 14 46 20 Z" style="fill: var(--lf, #7CC25A)"/>
          <path d="M45 19 C51 25 49 31 43 37 L16 57 C13 59 10 56 12 53 L28 27 C34 18 40 15 45 19 Z" style="fill: var(--lf, #FF8A2A)"/>
          <path d="M30 31 L35 35 M24 41 L28 44 M37 26 L41 29" style="fill: none; stroke: var(--ls, #C2581A); stroke-width: 2"/>
          <path d="M31 24 C34 21 37 20 40 20" style="fill: none; stroke: var(--lh, #FFD0A0); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-shrimp" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M18 46 L6 41 L9 50 L4 56 L19 53 Z" style="fill: var(--lf, #FFA27A)"/>
          <path d="M42 12 C56 19 58 40 45 50 C35 58 21 55 16 46 L27 41 C31 47 39 47 43 41 C47 35 45 26 37 22 Z" style="fill: var(--lf, #FF7A55)"/>
          <path d="M44 22 L51 17 M46 31 L55 30 M44 40 L51 45 M36 46 L37 54" style="fill: none; stroke: var(--ls, #C24A2E); stroke-width: 2"/>
          <circle cx="40" cy="17" r="2" style="fill: var(--ls, #2B1A12); stroke: none"/>
          <path d="M42 12 C40 6 34 3 28 4" style="fill: none; stroke-width: 2"/>
        </g>
      </symbol>
      <symbol id="ic-bacon" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M7 20 C15 13 24 27 32 20 C40 13 49 27 57 20 L57 44 C49 51 40 37 32 44 C24 51 15 37 7 44 Z" style="fill: var(--lf, #D9534F)"/>
          <path d="M7 29 C15 22 24 36 32 29 C40 22 49 36 57 29 L57 35 C49 42 40 28 32 35 C24 42 15 28 7 35 Z" style="fill: var(--lf, #FFE6DA)"/>
          <path d="M12 22 C15 20 18 21 20 23" style="fill: none; stroke: var(--lh, #FF9A90); stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="ic-cheese" viewBox="0 0 64 64">
        <g style="stroke: var(--ls, #2B1A12); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M8 31 L56 23 L56 49 L8 53 Z" style="fill: var(--lf, #FFC93A)"/>
          <path d="M8 31 L38 12 L56 23 Z" style="fill: var(--lf, #FFE48A)"/>
          <circle cx="20" cy="42" r="4" style="fill: var(--lf, #E2A21E); stroke: none"/>
          <circle cx="38" cy="36" r="3" style="fill: var(--lf, #E2A21E); stroke: none"/>
          <circle cx="47" cy="44" r="2.5" style="fill: var(--lf, #E2A21E); stroke: none"/>
          <path d="M40 18 L47 22" style="fill: none; stroke: var(--lh, #FFFFFF); stroke-width: 2.5"/>
        </g>
      </symbol>
<symbol id="u-oil" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <g transform="rotate(-38 34 30)">
            <rect x="24" y="22" width="20" height="32" rx="6" style="fill: #F5D570"/>
            <rect x="29" y="12" width="10" height="12" rx="3" style="fill: #F5D570"/>
            <rect x="28" y="6" width="12" height="7" rx="2" style="fill: #E5482C"/>
            <rect x="24" y="33" width="20" height="10" style="fill: #2F7A46"/>
            <path d="M29 26 V30" style="fill: none; stroke: #FFFFFF; stroke-width: 2.5"/>
          </g>
          <path d="M13 42 C16 47 17 50 13 54 C9 50 10 47 13 42 Z" style="fill: #F2C14A"/>
          <path d="M22 50 C24 53 24 55 22 57 C20 55 20 53 22 50 Z" style="fill: #F2C14A"/>
        </g>
      </symbol>
      <symbol id="u-stir" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M11 26 C13 17 20 11 29 9" style="fill: none; stroke: #FFB547; stroke-width: 2.5"/>
          <circle cx="21" cy="24" r="4" style="fill: #FFF8EC"/>
          <circle cx="31" cy="17" r="3.5" style="fill: #58B54A"/>
          <circle cx="41" cy="23" r="4" style="fill: #FFC93A"/>
          <path d="M48 36 L61 32 L62 37 L48 41 Z" style="fill: #8A5A32"/>
          <path d="M5 34 H49 C49 46 40 54 27 54 C14 54 5 46 5 34 Z" style="fill: #3A3D45"/>
          <path d="M11 39 C14 45 19 48 25 49" style="fill: none; stroke: #7A7F8C; stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="u-blaze" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M12 34 C7 25 13 18 15 10 C18 17 24 19 22 32 Z" style="fill: #FF8A3D"/>
          <path d="M44 34 C40 24 46 19 49 12 C52 19 58 22 54 34 Z" style="fill: #FF8A3D"/>
          <path d="M26 32 C23 22 30 14 33 4 C37 13 43 18 39 32 Z" style="fill: #FFB547"/>
          <path d="M30 32 C29 26 32 22 33 17 C35 22 37 26 35 32 Z" style="fill: #FFE48A; stroke-width: 2"/>
          <path d="M5 34 H59 C59 47 48 56 32 56 C16 56 5 47 5 34 Z" style="fill: #3A3D45"/>
          <path d="M12 40 C15 46 21 49 28 50" style="fill: none; stroke: #7A7F8C; stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="u-taste" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M12 20 C9 16 15 12 12 7 M20 16 C17 12 23 8 20 3" style="fill: none; stroke: #9FB0C8; stroke-width: 2.5"/>
          <g transform="rotate(38 34 34)">
            <rect x="31" y="34" width="7" height="28" rx="3.5" style="fill: #C9CED6"/>
            <ellipse cx="34.5" cy="24" rx="11" ry="13" style="fill: #DDE1E7"/>
            <ellipse cx="34.5" cy="23" rx="6.5" ry="7.5" style="fill: #FFC93A"/>
            <path d="M30 19 C31 17 33 16 35 16" style="fill: none; stroke: #FFFFFF; stroke-width: 2.5"/>
          </g>
        </g>
      </symbol>
      <symbol id="u-found" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M4 24 V56 C14 52 24 53 32 58 C40 53 50 52 60 56 V24" style="fill: #8A2E1C"/>
          <path d="M8 20 C16 16 25 17 32 23 V54 C25 49 16 48 8 51 Z" style="fill: #FFF4DC"/>
          <path d="M56 20 C48 16 39 17 32 23 V54 C39 49 48 48 56 51 Z" style="fill: #FFFDF5"/>
          <path d="M13 29 C18 27 23 28 27 30 M13 37 C18 35 23 36 27 38 M37 30 C41 28 46 27 51 29 M37 38 C41 36 46 35 51 37" style="fill: none; stroke: #C9B48A; stroke-width: 2"/>
          <path d="M48 1 L50.5 7 L57 9 L50.5 11 L48 17 L45.5 11 L39 9 L45.5 7 Z" style="fill: #FFB547; stroke-width: 2"/>
          <path d="M14 4 L15.5 8 L19.5 9.5 L15.5 11 L14 15 L12.5 11 L8.5 9.5 L12.5 8 Z" style="fill: #FFE08A; stroke-width: 2"/>
        </g>
      </symbol>
      <symbol id="u-hmm" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M11 10 H53 C56 10 58 12 58 15 V40 C58 43 56 45 53 45 H31 L18 56 L20 45 H11 C8 45 6 43 6 40 V15 C6 12 8 10 11 10 Z" style="fill: #FFF4DC"/>
          <path d="M25 23 C25 18 29 15 33 15 C37 15 40 18 40 22 C40 28 33 28 33 33" style="fill: none; stroke: #E5482C; stroke-width: 4"/>
          <circle cx="33" cy="39" r="2.4" style="fill: #E5482C; stroke: none"/>
        </g>
      </symbol>
      <symbol id="u-known" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M9 30 C9 19 17 12 28 12 C39 12 47 19 47 30 Z" style="fill: #FFF8EC"/>
          <path d="M6 30 H50 C50 42 41 50 28 50 C15 50 6 42 6 30 Z" style="fill: #E5482C"/>
          <circle cx="47" cy="45" r="12" style="fill: #34C38F"/>
          <path d="M41 45 L45.5 49.5 L53 40" style="fill: none; stroke: #FFFFFF; stroke-width: 3.5"/>
        </g>
      </symbol>
      <symbol id="u-research" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M27 6 V23 L12 50 C10 54 13 58 17 58 H47 C51 58 54 54 52 50 L37 23 V6 Z" style="fill: #E8F7F1"/>
          <path d="M18 41 H46 L52 50 C54 54 51 58 47 58 H17 C13 58 10 54 12 50 Z" style="fill: #34C38F"/>
          <path d="M24 6 H40" style="fill: none"/>
          <circle cx="28" cy="49" r="2.6" style="fill: #E8F7F1; stroke-width: 2"/>
          <circle cx="37" cy="46" r="2" style="fill: #E8F7F1; stroke-width: 2"/>
          <path d="M31 12 V20" style="fill: none; stroke: #FFFFFF; stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="u-truck" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <rect x="4" y="22" width="42" height="26" rx="4" style="fill: #E5482C"/>
          <path d="M46 29 H54 L60 37 V48 H46 Z" style="fill: #E5482C"/>
          <path d="M49 32 H53 L57 37 H49 Z" style="fill: #BFE3FF; stroke-width: 2"/>
          <rect x="10" y="27" width="30" height="11" rx="2" style="fill: #3A2A20"/>
          <path d="M2 22 H48 L44 13 H6 Z" style="fill: #FFF4DC"/>
          <path d="M14 13 L12 22 M25 13 V22 M36 13 L38 22" style="fill: none; stroke: #E5482C; stroke-width: 3"/>
          <circle cx="16" cy="49" r="6" style="fill: #2B2118"/>
          <circle cx="50" cy="49" r="6" style="fill: #2B2118"/>
          <circle cx="16" cy="49" r="2" style="fill: #8A8F99; stroke: none"/>
          <circle cx="50" cy="49" r="2" style="fill: #8A8F99; stroke: none"/>
        </g>
      </symbol>
      <symbol id="u-close" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M34 8 C24 11 19 22 22 32 C25 42 35 47 45 44 C38 51 24 50 16 41 C8 31 12 14 25 9 C28 8 31 7.5 34 8 Z" style="fill: #FFE08A"/>
          <path d="M50 4 V14" style="fill: none; stroke-width: 2.5"/>
          <rect x="45" y="13" width="10" height="4" rx="1" style="fill: #3A2A20; stroke-width: 2"/>
          <ellipse cx="50" cy="28" rx="10" ry="12" style="fill: #E5482C"/>
          <path d="M42 28 H58" style="fill: none; stroke: #FFB547; stroke-width: 2.5"/>
          <rect x="45" y="39" width="10" height="4" rx="1" style="fill: #3A2A20; stroke-width: 2"/>
          <path d="M6 54 L7.5 57.5 L11 59 L7.5 60.5 L6 64 L4.5 60.5 L1 59 L4.5 57.5 Z" style="fill: #FFE08A; stroke-width: 1.5"/>
        </g>
      </symbol>
      <symbol id="u-home" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <rect x="42" y="10" width="7" height="12" style="fill: #8A5A32"/>
          <rect x="12" y="28" width="40" height="28" style="fill: #FFF4DC"/>
          <path d="M5 31 L32 8 L59 31 Z" style="fill: #E5482C"/>
          <rect x="27" y="40" width="11" height="16" rx="2" style="fill: #8A5A32"/>
          <rect x="16" y="35" width="8" height="8" rx="1" style="fill: #FFE08A"/>
          <rect x="42" y="35" width="7" height="8" rx="1" style="fill: #FFE08A"/>
        </g>
      </symbol>
      <symbol id="u-logo" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M32 3 C41 13 47 18 47 28 C47 36 40 41 32 41 C24 41 17 36 17 28 C17 22 21 19 23 13 C25 18 28 20 30 20 C30 14 30 9 32 3 Z" style="fill: #FF8A3D"/>
          <path d="M32 18 C36 23 39 26 39 31 C39 36 36 38 32 38 C28 38 25 36 25 31 C25 27 28 25 30 21 C31 23 32 23 32 18 Z" style="fill: #FFE48A; stroke-width: 2.5"/>
          <path d="M4 38 H60 C60 51 49 59 32 59 C15 59 4 51 4 38 Z" style="fill: #3A3D45"/>
          <path d="M11 44 C14 50 20 53 27 54" style="fill: none; stroke: #7A7F8C; stroke-width: 2.5"/>
        </g>
      </symbol>
      <symbol id="u-bonus" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M26 6 C35 16 41 21 41 32 C41 42 34 48 26 48 C18 48 11 42 11 33 C11 26 15 23 17 16 C19 21 22 23 24 23 C24 16 24 11 26 6 Z" style="fill: #FF8A3D"/>
          <path d="M26 24 C30 29 33 32 33 37 C33 42 30 44 26 44 C22 44 19 42 19 37 C19 33 22 31 24 27 C25 29 26 29 26 24 Z" style="fill: #FFE48A; stroke-width: 2.5"/>
          <path d="M47 40 L54 30 L61 40 M54 31 V58" style="fill: none; stroke: #34C38F; stroke-width: 4"/>
        </g>
      </symbol>
      <symbol id="u-tip" viewBox="0 0 64 64">
        <g style="stroke: #2B1A12; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round">
          <path d="M10 44 V50 C10 54 20 57 30 57 C40 57 50 54 50 50 V44" style="fill: #E2A21E"/>
          <ellipse cx="30" cy="44" rx="20" ry="7" style="fill: #FFC93A"/>
          <path d="M14 34 V40 C14 44 24 47 34 47 C44 47 54 44 54 40 V34" style="fill: #E2A21E"/>
          <ellipse cx="34" cy="34" rx="20" ry="7" style="fill: #FFC93A"/>
          <circle cx="40" cy="16" r="12" style="fill: #FFC93A"/>
          <path d="M40 9 L42 14 L47 14.5 L43 18 L44.5 23 L40 20 L35.5 23 L37 18 L33 14.5 L38 14 Z" style="fill: #FFF4DC; stroke-width: 2"/>
        </g>
      </symbol>
`;

/** 문서에 아이콘 스프라이트를 한 번 넣는다 */
export function installIcons() {
  if (document.getElementById('icon-sprite')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="icon-sprite" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SPRITE}</defs></svg>`;
  document.body.prepend(holder.firstElementChild!);
}

export type UiIcon =
  | 'oil' | 'stir' | 'blaze' | 'taste' | 'found' | 'hmm' | 'known'
  | 'research' | 'truck' | 'close' | 'home' | 'logo' | 'bonus' | 'tip';

/** 아이콘 <svg> 마크업. id 는 'ic-rice' 처럼 전체 id */
export const svgIcon = (id: string, cls = '', label = '') =>
  `<svg class="${cls}" viewBox="0 0 64 64"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}><use href="#${id}"/></svg>`;
