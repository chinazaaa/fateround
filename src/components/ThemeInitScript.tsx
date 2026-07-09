import { THEME_COOKIE, THEME_STORAGE_KEY } from '@/lib/theme-cookie'

/** Runs before paint so theme matches stored preference without blocking SSR on cookies(). */
export function ThemeInitScript() {
  const script = `(function(){try{var k='${THEME_STORAGE_KEY}',c='${THEME_COOKIE}',t=null;try{t=localStorage.getItem(k)}catch(e){}if(t!=='dark'&&t!=='light'){var m=document.cookie.match(new RegExp('(?:^|; )'+c+'=([^;]*)'));t=m?decodeURIComponent(m[1]):'light'}if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
