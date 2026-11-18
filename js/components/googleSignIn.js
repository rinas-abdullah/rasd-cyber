document.addEventListener('DOMContentLoaded', async () => {
  const button=document.getElementById('googleSignIn');
  const label=document.getElementById('googleSignInLabel');
  const message=document.getElementById('googleAuthMessage');
  const divider=document.getElementById('googleEmailDivider');
  const params=new URLSearchParams(location.search);
  const error=params.get('google_error');
  let enabled=false, failed=false, completing=params.get('google')==='success';
  const copy={
    en:{ button:'Continue with Google', divider:'or use your email', unavailable:'Google sign-in is currently unavailable. You can sign in with your email.',
      cancelled:'Google sign-in was cancelled. You can try again.', invalid_state:'This sign-in request expired. Please try again.',
      account_exists:'An account already uses this email. Please sign in with your existing password.', disabled:'This account is disabled. Contact your administrator.',
      failed:'Could not complete Google sign-in. Please try again.', completing:'Signing you in…' },
    ar:{ button:'المتابعة باستخدام Google', divider:'أو استخدم بريدك الإلكتروني', unavailable:'تسجيل الدخول عبر Google غير متاح حاليًا. يمكنك الدخول بالبريد الإلكتروني.',
      cancelled:'أُلغيت عملية الدخول عبر Google. يمكنك المحاولة مجددًا.', invalid_state:'انتهت صلاحية طلب الدخول. حاول مجددًا.',
      account_exists:'يوجد حساب بهذا البريد مسبقًا. ادخل باستخدام كلمة مرور حسابك الحالي.', disabled:'هذا الحساب معطّل. تواصل مع مسؤول المنصة.',
      failed:'تعذّر إكمال الدخول عبر Google. حاول مجددًا.', completing:'جارٍ تسجيل دخولك…' },
  };
  function render(){
    const lang=window.i18n?.getCurrentLanguage() || document.documentElement.lang;
    const t=copy[lang==='ar'?'ar':'en'];
    label.textContent=t.button;divider.textContent=t.divider;
    message.textContent=completing?t.completing:failed?t.failed:error?(t[error]||t.failed):enabled?'':t.unavailable;
  }
  window.addEventListener('languageChanged',render);
  render();
  if(error || completing){params.delete('google_error');params.delete('google');history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);}
  if(completing){
    try{
      const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if(!response.ok || !data.success || !data.data?.user)throw new Error('No authenticated user');
      const user=data.data.user;
      window.authService.setAuthData(null,user.id,user.username,user.role);
      if(user.institution_id)localStorage.setItem('institution_id',String(user.institution_id));
      else localStorage.removeItem('institution_id');
      const saved=window.authService.getRedirectAfterLogin();
      window.authService.clearRedirectAfterLogin();
      let destination='/ai-command';
      if(saved){const url=new URL(saved,location.origin);if(url.origin===location.origin && !['/auth','/login','/auth.html'].includes(url.pathname))destination=url.pathname+url.search+url.hash;}
      location.replace(destination);return;
    }catch{completing=false;failed=true;render();}
  }
  try{
    const response=await fetch('/api/auth/providers',{cache:'no-store'});
    const data=await response.json();
    enabled=response.ok && data.data?.google?.enabled===true;
    if(enabled){button.href='/api/auth/google';button.removeAttribute('aria-disabled');button.removeAttribute('tabindex');}
  }catch{enabled=false;}
  render();
});
