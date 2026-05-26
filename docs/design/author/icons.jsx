// author/icons.jsx — Minimal stroked icons (Lucide-style) for the editor.
// Single file, all icons share the same stroke + viewBox conventions.

const __ico = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

function IcoBook()   { return <svg {...__ico}><path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4z"/><path d="M5 18a2 2 0 002 2h12"/></svg>; }
function IcoLessons(){ return <svg {...__ico}><path d="M4 6h16M4 12h16M4 18h10"/></svg>; }
function IcoChart()  { return <svg {...__ico}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-9"/></svg>; }
function IcoUsers()  { return <svg {...__ico}><circle cx="9" cy="9" r="3"/><circle cx="17" cy="8.5" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5"/><path d="M14 18c0-2 1.5-3.5 4-3.5"/></svg>; }
function IcoMoney()  { return <svg {...__ico}><circle cx="12" cy="12" r="9"/><path d="M9 9.5C9 8 10 7 12 7s3 1 3 2.5S14 11 12 11s-3 1-3 2.5S10 17 12 17s3-1 3-2.5"/></svg>; }
function IcoCog()    { return <svg {...__ico}><circle cx="12" cy="12" r="2.5"/><path d="M19.4 15a1.6 1.6 0 00.3 1.7l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.8 1V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-2.8-1l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.6 1.6 0 00-1-2.8H3a2 2 0 010-4h.1a1.6 1.6 0 001-2.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.6 1.6 0 002.8-1V3a2 2 0 014 0v.1a1.6 1.6 0 002.8 1l.1-.1a2 2 0 012.8 2.8l-.1.1a1.6 1.6 0 001 2.8H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1 2.8z"/></svg>; }
function IcoPlus()   { return <svg {...__ico}><path d="M12 5v14M5 12h14"/></svg>; }
function IcoGrip()   { return <svg {...__ico}><circle cx="9" cy="6" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="9" cy="18" r=".9"/><circle cx="15" cy="6" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="15" cy="18" r=".9"/></svg>; }
function IcoArrow()  { return <svg {...__ico}><path d="M5 12h14M13 6l6 6-6 6"/></svg>; }
function IcoMore()   { return <svg {...__ico}><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>; }
function IcoEye()    { return <svg {...__ico}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>; }
function IcoUndo()   { return <svg {...__ico}><path d="M3 12h13a5 5 0 010 10"/><path d="M3 12l5-5M3 12l5 5"/></svg>; }
function IcoSpark()  { return <svg {...__ico}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>; }
function IcoTrash()  { return <svg {...__ico}><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/></svg>; }
function IcoDup()    { return <svg {...__ico}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10"/></svg>; }
function IcoEdit()   { return <svg {...__ico}><path d="M4 20h4l12-12-4-4L4 16v4z"/></svg>; }
function IcoCheck()  { return <svg {...__ico}><path d="M5 12l5 5L20 7"/></svg>; }
function IcoClose()  { return <svg {...__ico}><path d="M6 6l12 12M18 6L6 18"/></svg>; }
function IcoCalendar(){ return <svg {...__ico}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>; }

// Block kind icons (each block in the library)
function IcoTitle()    { return <svg {...__ico}><path d="M6 6h12M6 12h12M6 18h7"/></svg>; }
function IcoProse()    { return <svg {...__ico}><path d="M4 6h16M4 10h16M4 14h12M4 18h10"/></svg>; }
function IcoGoal()     { return <svg {...__ico}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>; }
function IcoQuote()    { return <svg {...__ico}><path d="M7 7v6c0 2.5-1.5 4-3.5 4M17 7v6c0 2.5-1.5 4-3.5 4"/><path d="M7 7H4v6h3V7zM17 7h-3v6h3V7z"/></svg>; }
function IcoSidebar()  { return <svg {...__ico}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/></svg>; }
function IcoFlip()     { return <svg {...__ico}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 9l3 3-3 3M15 9l-3 3 3 3"/></svg>; }
function IcoQuiz()     { return <svg {...__ico}><circle cx="12" cy="12" r="9"/><path d="M9 9c0-1.7 1.3-3 3-3s3 1.3 3 3-3 1.5-3 4"/><circle cx="12" cy="17" r=".7"/></svg>; }
function IcoAssess()   { return <svg {...__ico}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 10h8M8 14h6"/><circle cx="6.2" cy="10" r=".9"/><circle cx="6.2" cy="14" r=".9"/></svg>; }
function IcoChecklist(){ return <svg {...__ico}><path d="M9 6l-3 3-2-2M9 12l-3 3-2-2M9 18l-3 3-2-2"/><path d="M12 7h9M12 13h9M12 19h9"/></svg>; }
function IcoExercise() { return <svg {...__ico}><path d="M4 20h16"/><path d="M16 3l5 5L8 21H3v-5z"/></svg>; }
function IcoVideo()    { return <svg {...__ico}><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2z"/></svg>; }
function IcoAudio()    { return <svg {...__ico}><path d="M9 9v6M5 11v2M13 7v10M17 9v6M21 11v2"/></svg>; }
function IcoImage()    { return <svg {...__ico}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 18l-5-6-4 4-2-2-7 5"/></svg>; }
function IcoPdf()      { return <svg {...__ico}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>; }
function IcoSep()      { return <svg {...__ico}><path d="M3 12h18"/></svg>; }
function IcoConvert()  { return <svg {...__ico}><path d="M4 7h13M14 4l3 3-3 3"/><path d="M20 17H7M10 14l-3 3 3 3"/></svg>; }
function IcoNext()     { return <svg {...__ico}><path d="M12 3v18M5 10l7 7 7-7"/></svg>; }
function IcoTone()     { return <svg {...__ico}><path d="M5 12l4 4 10-10"/><circle cx="5" cy="12" r="1"/></svg>; }
function IcoSummary()  { return <svg {...__ico}><path d="M4 6h10M4 10h16M4 14h8M4 18h13"/></svg>; }
function IcoIncl()     { return <svg {...__ico}><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>; }
function IcoSearch()   { return <svg {...__ico}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>; }
function IcoVersions() { return <svg {...__ico}><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z"/><path d="M12 7v5l3 2"/><path d="M3 12H1"/></svg>; }
function IcoSave()     { return <svg {...__ico}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M7 3v6h10V3"/></svg>; }

window.EditorIcons = {
  IcoBook, IcoLessons, IcoChart, IcoUsers, IcoMoney, IcoCog, IcoPlus, IcoGrip,
  IcoArrow, IcoMore, IcoEye, IcoUndo, IcoSpark, IcoTrash, IcoDup, IcoEdit,
  IcoCheck, IcoClose, IcoCalendar, IcoTitle, IcoProse, IcoGoal, IcoQuote,
  IcoSidebar, IcoFlip, IcoQuiz, IcoAssess, IcoChecklist, IcoExercise,
  IcoVideo, IcoAudio, IcoImage, IcoPdf, IcoSep, IcoConvert, IcoNext, IcoTone,
  IcoSummary, IcoIncl, IcoSearch, IcoVersions, IcoSave,
};

// Map AI helper id → icon component
window.AI_HELPER_ICONS = {
  "suggest-quiz": IcoQuiz,
  "convert-libro-guia": IcoConvert,
  "suggest-next": IcoNext,
  "tone-review": IcoTone,
  "summarize": IcoSummary,
  "inclusivity": IcoIncl,
  "image": IcoImage,
};

// Map block kind → icon component
window.BLOCK_ICONS = {
  title:            IcoTitle,
  prose:            IcoProse,
  goal:             IcoGoal,
  "author-insight": IcoQuote,
  sidebar:          IcoSidebar,
  flip:             IcoFlip,
  quiz:             IcoQuiz,
  assessment:       IcoAssess,
  checklist:        IcoChecklist,
  exercise:         IcoExercise,
  video:            IcoVideo,
  audio:            IcoAudio,
  image:            IcoImage,
  pdf:              IcoPdf,
  separator:        IcoSep,
};
