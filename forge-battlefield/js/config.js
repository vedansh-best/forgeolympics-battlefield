/* =====================================================================
   FORGE OLYMPICS · CONFIG
   This is the only file you should need to edit. No build step.
   ===================================================================== */
window.CONFIG = {
  // The Google Sheet (must be shared "Anyone with the link · Viewer").
  SHEET_ID: '1l361HGz0d7Unso6XmVFUd5CEY4EdvElaH51HC9zE-xI',
  SHEET_TAB: 'Scores',
  // Backup feed, used only if the sheet ever stops being public.
  API_URL: 'https://script.google.com/macros/s/AKfycbzrv3Ryq9GUvXFBLieXT6aZkjSbRYka5WRbjnUamMZuEbFf0XrRDw-n1TjWSb1EktEdoA/exec',
  // How often to pull fresh scores (milliseconds).
  REFRESH_MS: 15000,

  // Battlefield backdrop.
  //  'image' = a painted backdrop (BACKGROUND_IMAGE), animated with live fire, smoke, sparks, embers and drifting clouds.
  //            Options: 'assets/battlefield-fissure.webp' (cracked battlefield, castle behind) or 'assets/battlefield.webp' (moon painting).
  //  '3d'    = the fully procedural 3D world (sky, castle, lava ground, warriors).
  BACKGROUND: 'image',
  BACKGROUND_IMAGE: 'assets/battlefield-fissure.webp',

  // How the standings appear on the first screen: 'bars' (leaderboard bars) or 'flags' (waving 3D house flags).
  HERO_STYLE: 'flags',

  // When and where the remaining battles happen. Drives the countdown.
  EVENT: { start: '2026-10-12T12:00:00+05:30', label: 'Mon 12 Oct · 12 PM', venue: 'DHI', hours: 12 },

  // House names must match the sheet column headers.
  HOUSES: {
    Vikings:    { color:'#F2BD0E', deep:'#6b4a00', glow:'#FFD54A', logo:'assets/logos/vikings.png',    captain:'Maitree Shah',      bar:['#f7d36a','#e2b21c'], cap:'#fdeeb8' },
    Samurai:    { color:'#2F62D8', deep:'#122a66', glow:'#7DA2FF', logo:'assets/logos/samurai.png',    captain:'Zalak Gogri',        bar:['#8fb8f7','#3f86e8'], cap:'#c9defd' },
    Gladiators: { color:'#40A261', deep:'#14462a', glow:'#62D78E', logo:'assets/logos/gladiators.png', captain:'Aarav Shrivastava', bar:['#86e2b4','#3cc086'], cap:'#c7f3dc' },
    Knights:    { color:'#C0182A', deep:'#4f0710', glow:'#FF5A66', logo:'assets/logos/knights.png',    captain:'Preet Jain',        bar:['#f3a0a0','#dc5454'], cap:'#fbd2d2' }
  },

  // Games are grouped into "fronts" by matching their names.
  FRONTS: [
    { id:'trials', name:'Trials of Wit',   icon:'🧠', re:/pyramid|turtle|pipeline|chess|quiz|puzzle/i },
    { id:'field',  name:'Field Warfare',   icon:'⚔️', re:/football|cricket|basket|dodge|tug|volley|kabaddi|frisbee/i },
    { id:'duels',  name:'Racquet Duels',   icon:'🏸', re:/tennis|badminton|pickle|squash/i },
    { id:'charge', name:'The Charge',      icon:'🏃', re:/\d+\s*m\b|relay|sprint|race|run/i },
    { id:'honour', name:'Honour & Spirit', icon:'🔥', re:/spirit|honou?r|award/i }
  ]
};
