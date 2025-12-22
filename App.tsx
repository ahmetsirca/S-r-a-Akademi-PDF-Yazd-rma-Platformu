import React, { useState, useEffect } from 'react';
import { ViewState, PDFBook, AccessKey, UserProfile, UserPermission } from './types';
import { StorageService } from './services/storage';
import { DBService } from './services/db';
import { AuthService } from './services/auth';
import AdminDashboard from './components/AdminDashboard';
import UserViewer from './components/UserViewer';
import { Session } from '@supabase/supabase-js';

const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<ViewState>('USER_LOGIN');
  const [isLoading, setIsLoading] = useState(false);

  // Auth State
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userPermission, setUserPermission] = useState<UserPermission | null>(null);
  const [isDeviceVerified, setIsDeviceVerified] = useState(true);

  // Login/Register Mode
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Auth Inputs
  const [adminInput, setAdminInput] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState(''); // Restore Code Input

  // Folder System State
  const [folders, setFolders] = useState<import('./types').Folder[]>([]);
  const [folderContent, setFolderContent] = useState<import('./types').FolderContent[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderKeyInput, setFolderKeyInput] = useState('');
  const [navigationStack, setNavigationStack] = useState<import('./types').Folder[]>([]);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<string[]>([]);
  const [currentFolderKey, setCurrentFolderKey] = useState<import('./types').FolderKey | null>(null);

  // Viewer State
  const [activeBook, setActiveBook] = useState<PDFBook | null>(null);
  const [activeKey, setActiveKey] = useState<AccessKey | null>(null);

  // Initial Fetch & Auth Check
  useEffect(() => {
    fetchInitialData();

    // Check saved session
    const savedUser = AuthService.loadSession();
    if (savedUser) {
      // Just refresh profile for permissions, no auto-login logic deep check for now
      // But ideally we should re-verify permissions
      AuthService.checkPermissionAccess(savedUser.fullName || '', savedUser.email)
        .then(res => {
          if (res) {
            setSession({ user: { id: res.profile.id } } as any);
            setUserProfile(res.profile);
            setIsDeviceVerified(res.isDeviceApproved);
            DBService.getUserPermissions(res.profile.id).then(setUserPermission);
          } else {
            AuthService.logout(savedUser.id);
          }
        })
        .catch(() => savedUser.id && AuthService.logout(savedUser.id));
    }
  }, []);

  const fetchInitialData = async () => {
    setFolders(await StorageService.getFolders());
  };

  const handleCustomAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let res;

      if (authMode === 'REGISTER') {
        if (!loginName || !loginEmail || !loginPassword) { throw new Error("Ad, E-posta ve Şifre zorunludur."); }
        const profile = await AuthService.register(loginName, loginEmail, loginPassword, loginCode); // Pass Code
        alert("Kayıt Başarılı! Şimdi giriş yapabilirsiniz.");
        setAuthMode('LOGIN');
        setLoginPassword('');
        setIsLoading(false);
        return;
      } else {
        // LOGIN
        if (!loginEmail || !loginPassword) { throw new Error("E-posta ve Şifre zorunludur."); }
        res = await AuthService.login(loginEmail, loginPassword); // Verified fix
      }

      if (res) {
        AuthService.saveSession(res.profile);
        setSession({ user: { id: res.profile.id } } as any);
        setUserProfile(res.profile);
        setIsDeviceVerified(res.isDeviceApproved);

        DBService.logActivity(res.profile.id, 'LOGIN', null, `User logged in. Device Verified: ${res.isDeviceApproved}`);

        if (res.unlockedFolders.length > 0) {
          setUnlockedFolderIds(res.unlockedFolders);
          setView('USER_FOLDER_VIEW');
        } else {
          // No folders assigned yet. Still allow login but show root.
          setUnlockedFolderIds([]);
          // alert("Giriş başarılı. Henüz atanmış klasörünüz yok.");
        }

        DBService.getUserPermissions(res.profile.id).then(setUserPermission);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "İşlem başarısız.");
    } finally {
      setIsLoading(false);
    }
  };


  const handleLogout = async () => {
    if (userProfile) {
      await AuthService.logout(userProfile.id);
      setSession(null);
      setUserProfile(null);
      setUserPermission(null);
      setView('USER_LOGIN');
      setLoginPassword('');
      setUnlockedFolderIds([]);
      setNavigationStack([]);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInput === StorageService.getAdminPass()) {
      setView('ADMIN_DASHBOARD');
      setAdminInput('');
    } else {
      alert('Hatalı yönetici şifresi');
    }
  };

  // --- Folder Navigation Logic ---
  const handleFolderClick = async (folder: import('./types').Folder) => {
    // Check if unlocked or requires auth
    if (unlockedFolderIds.includes(folder.id)) {
      setNavigationStack(prev => [...prev, folder]);
      setFolderContent(await StorageService.getFolderContent(folder.id));
      setView('USER_FOLDER_VIEW');
    } else {
      // Require Auth
      setSelectedFolderId(folder.id);
      setFolderKeyInput('');
      setView('USER_FOLDER_AUTH');
    }
  };

  const handleFolderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderId) return;

    const keyData = await StorageService.verifyFolderKey(selectedFolderId, folderKeyInput);
    if (keyData) {
      // Success! Unlock ALL folders this key provides access to
      setUnlockedFolderIds(prev => [...new Set([...prev, ...keyData.folderIds])]);
      setCurrentFolderKey(keyData);

      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder) setNavigationStack(prev => [...prev, folder]);

      setFolderContent(await StorageService.getFolderContent(selectedFolderId));
      setView('USER_FOLDER_VIEW');
    } else {
      alert("Hatalı veya süresi dolmuş şifre!");
    }
  };

  const handleNavigateBack = async () => {
    const newStack = [...navigationStack];
    newStack.pop();
    setNavigationStack(newStack);
    if (newStack.length === 0) {
      setView('USER_LOGIN');
    } else {
      // Refresh content for previous folder
      const prevFolder = newStack[newStack.length - 1];
      setFolderContent(await StorageService.getFolderContent(prevFolder.id));
    }
  };

  const handleContentClick = (content: import('./types').FolderContent) => {
    if (content.type === 'link') {
      window.open(content.url, '_blank');
    } else {
      // Open PDF in Secure Viewer
      // Open PDF in Secure Viewer
      const mockBook: PDFBook = {
        id: content.id,
        name: content.title,
        collectionId: content.folderId,
        sourceType: content.url.includes('http') || content.type === 'link' ? 'LINK' : 'FILE', // Auto-detect for safety, or we should pass it
        sourceUrl: content.url,
        pdfData: content.url, // For FILE type, viewer attempts to fetch this
        createdAt: Date.now()
      };

      // Use the verified folder key's permissions
      const limit = currentFolderKey?.allowPrint ? 9999 : 0;

      const mockKey: AccessKey = {
        id: 'folder-access',
        key: currentFolderKey?.keyCode || 'folder-key',
        bookId: content.id,
        printLimit: limit,
        printCount: 0
      };
      setActiveBook(mockBook);
      setActiveKey(mockKey);
      setView('USER_VIEWER');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      {view !== 'USER_VIEWER' && (
        <nav className="p-4 flex justify-between items-center bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('USER_LOGIN')}>
            <div className="bg-blue-600 w-8 h-8 rounded flex items-center justify-center text-white shadow-sm">
              <i className="fas fa-book-open"></i>
            </div>
            <span className="font-bold text-xl text-slate-800 tracking-tight">SIRÇA <span className="text-blue-600">AKADEMİ</span></span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setView('USER_LOGIN')}
              className={`text-sm font-medium transition ${view === 'USER_LOGIN' || view === 'USER_FOLDER_VIEW' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Kullanıcı Girişi
            </button>
            <button
              onClick={() => setView('ADMIN_LOGIN')}
              className={`text-sm font-medium transition ${view === 'ADMIN_LOGIN' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Yönetici Paneli
            </button>
          </div>
        </nav>
      )}

      {/* Render View */}
      <main>
        {view === 'USER_LOGIN' && (
          <>
            <div className="max-w-4xl mx-auto mt-12 grid md:grid-cols-2 gap-8 px-4">
              {/* Left: Login Panel */}
              <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-100 h-fit">
                {userProfile ? (
                  <div className="text-center">
                    <div className="bg-indigo-900/50 p-4 rounded-xl mb-6 border border-indigo-500/30 text-center animate-fade-in">
                      <img
                        src={userProfile.avatarUrl || `https://ui-avatars.com/api/?name=${userProfile.fullName}&background=random`}
                        className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-green-400"
                        alt="Avatar"
                      />
                      <p className="text-slate-800 font-bold">{userProfile.fullName}</p>
                      <p className="text-indigo-600 text-xs mb-3">{userProfile.email}</p>

                      {!isDeviceVerified && (
                        <div className="bg-red-500/10 text-red-600 text-xs p-2 rounded mb-3 border border-red-500/20 font-bold">
                          <i className="fas fa-exclamation-triangle mr-1"></i> Yeni Cihaz (Onay Bekliyor)
                        </div>
                      )}

                      <div className="flex gap-2 justify-center mt-4">
                        <button
                          onClick={handleLogout}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm transition"
                        >
                          Çıkış Yap
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-8">
                      <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className={`fas ${authMode === 'LOGIN' ? 'fa-sign-in-alt' : 'fa-user-plus'} text-2xl text-blue-600`}></i>
                      </div>
                      <h1 className="text-2xl font-bold text-slate-800">{authMode === 'LOGIN' ? 'Öğrenci Girişi' : 'Kayıt Ol'}</h1>
                      <p className="text-slate-500 mt-2">
                        {authMode === 'LOGIN' ? 'E-posta ve Şifrenizle giriş yapın.' : 'Bilgilerinizi girerek sisteme kayıt olun.'}
                      </p>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                      <button
                        type="button"
                        onClick={() => { setAuthMode('LOGIN'); setLoginName(''); setLoginEmail(''); setLoginPassword(''); setLoginCode(''); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'LOGIN' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Giriş Yap
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAuthMode('REGISTER'); setLoginName(''); setLoginEmail(''); setLoginPassword(''); setLoginCode(''); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'REGISTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Kayıt Ol
                      </button>
                    </div>

                    <form onSubmit={handleCustomAuth} className="space-y-4">
                      {authMode === 'REGISTER' && (
                        <div>
                          <input
                            type="text"
                            placeholder="Ad Soyad"
                            className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                            value={loginName}
                            onChange={e => setLoginName(e.target.value)}
                            required
                          />
                        </div>
                      )}
                      <div>
                        <input
                          type="email"
                          placeholder="E-posta"
                          className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                          value={loginEmail}
                          onChange={e => setLoginEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          placeholder="Şifre"
                          className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition font-mono tracking-widest"
                          value={loginPassword}
                          onChange={e => setLoginPassword(e.target.value)}
                          required
                        />
                      </div>

                      {/* Access Code - Show for BOTH Login and Register */}
                      <button
                        disabled={isLoading}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isLoading ? 'İşlem Yapılıyor...' : (authMode === 'LOGIN' ? 'Giriş Yap' : 'Kayıt Ol')}
                      </button>
                    </form>
                    <p className="text-[10px] text-center text-slate-400 mt-4">
                      {authMode === 'REGISTER' ? '* Kayıt sonrası yönetici onayı beklemeniz gerekebilir.' : '* Şifrenizi unuttuysanız yöneticiyle iletişime geçin.'}
                    </p>
                  </>
                )}
              </div>

              {/* Right: Derslerim (Folders) */}
              <div>
                {/* Access Code Card - NEW */}
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-100 mb-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
                    <i className="fas fa-key text-8xl text-indigo-900"></i>
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold text-slate-800 mb-1">YAZDIRMAK İÇİN ERİŞİM ŞİFRESİNİ GİR</h3>
                    <p className="text-xs text-slate-500 mb-4">Elinizdeki özel erişim kodunu buraya girerek ilgili içeriklere erişebilirsiniz.</p>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Erişim Şifresi"
                        className="flex-1 p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono tracking-widest text-center uppercase"
                        value={loginCode}
                        onChange={e => setLoginCode(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (!loginCode) return alert("Lütfen şifre girin.");
                          setIsLoading(true);
                          try {
                            if (userProfile) {
                              // User Logged In -> Redeem Code directly
                              await AuthService.redeemCode(userProfile.id, loginCode.trim());
                              alert("Teşekkürler! Erişim şifreniz hesabınıza tanımlandı. İlgili klasörlere artık erişebilirsiniz.");
                              setLoginCode('');

                              // Refresh permissions
                              DBService.getUserPermissions(userProfile.id).then(setUserPermission);
                              // Refresh folders permissions locally if needed (re-login logic basically refreshes unclocked folders)
                              // But visually, the user can just click folders.
                              // Ideally we should reload the 'unlockedFolderIds' state
                              const sess = await AuthService.checkPermissionAccess(userProfile.fullName, userProfile.email);
                              if (sess) setUnlockedFolderIds(sess.unlockedFolders);

                            } else {
                              // Not Logged In -> Just alert
                              alert("Şifre algılandı. Erişim sağlamak için lütfen sol taraftan Giriş Yapın veya Kayıt Olun. Girdiğiniz şifre otomatik olarak hesabınıza eklenecektir.");
                              // We keep loginCode in state so it populates the Login/Register flow automatically if we were to modify it to read from there.
                              // But currently our Login/Register inputs read from their own state? 
                              // Wait, 'loginCode' state is shared! 
                              // const [loginCode, setLoginCode] = useState(''); declared at top of App
                              // So when they type here, it updates the state used by Login/Register logic too!
                              // So they just need to fill the rest of the form.
                            }
                          } catch (e: any) {
                            alert(e.message || "Hata oluştu.");
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 font-bold shadow-md active:scale-95 transition"
                      >
                        <i className="fas fa-arrow-right"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mb-6 flex items-center gap-2">
                  <i className="fas fa-chalkboard-teacher text-blue-600 text-2xl"></i>
                  <h2 className="text-2xl font-bold text-slate-800">Derslerim</h2>
                </div>

                {folders.length === 0 && !unlockedFolderIds.some((id: string) => id.startsWith('BOOK:')) ? (
                  <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-200 border-dashed">
                    <p className="text-slate-400">Henüz ders klasörü eklenmemiş.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Render Real Folders */}
                    {folders.filter(f => !f.parentId).map(f => (
                      <div
                        key={f.id}
                        onClick={() => handleFolderClick(f)}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-300 transition group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                              <i className="fas fa-folder text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-slate-800">{f.title}</h3>
                              <p className="text-xs text-slate-500">Giriş Yapmak İçin Tıklayın</p>
                            </div>
                          </div>
                          <i className="fas fa-chevron-right text-slate-300 "></i>
                        </div>
                      </div>
                    ))}

                    {/* Render Virtual 'Legacy Library' Folder if User has unlocked individual books */}
                    {unlockedFolderIds.some((id: string) => id.startsWith('BOOK:')) && (
                      <div
                        onClick={async () => {
                          // 1. Identify unlocked book IDs
                          const bookIds = unlockedFolderIds.filter((id: string) => id.startsWith('BOOK:')).map((id: string) => id.replace('BOOK:', ''));
                          // 2. Fetch ALL books (Legacy) - In a real app we might want to batch fetch, but here getBooks is okay.
                          const allBooks = await StorageService.getBooks();
                          const unlockedBooks = allBooks.filter(b => bookIds.includes(b.id));

                          // 3. Create a Virtual Folder Object
                          const virtualFolder: import('./types').Folder = {
                            id: 'VIRTUAL_LIBRARY',
                            parentId: null,
                            title: 'Bireysel Kütüphane',
                            isActive: true,
                            createdAt: Date.now()
                          };

                          // 4. Navigate
                          setNavigationStack(prev => [...prev, virtualFolder]);

                          // 5. Convert Books to FolderContent
                          const virtualContent: import('./types').FolderContent[] = unlockedBooks.map(b => ({
                            id: b.id,
                            folderId: 'VIRTUAL_LIBRARY',
                            type: 'pdf', // Legacy books are PDFs
                            title: b.name,
                            url: b.sourceUrl || '',
                            createdAt: b.createdAt
                          }));

                          setFolderContent(virtualContent);
                          setView('USER_FOLDER_VIEW');
                        }}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-indigo-300 transition group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition">
                              <i className="fas fa-book text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-slate-800">Bireysel Kütüphane</h3>
                              <p className="text-xs text-slate-500">Erişim kodlu tekil kitaplarınız</p>
                            </div>
                          </div>
                          <i className="fas fa-chevron-right text-slate-300 "></i>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Social Media Links */}
            <div className="max-w-4xl mx-auto mt-12 mb-20 px-4">
              <div className="bg-white rounded-full shadow-sm border border-slate-200 p-4 flex justify-around items-center">
                <span className="font-bold text-slate-400 text-sm hidden md:block">BİZİ TAKİP EDİN</span>
                <div className="flex gap-6">
                  <a href="https://www.youtube.com/@komiserimpaemisyon" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition font-medium">
                    <i className="fab fa-youtube text-2xl"></i> <span className="hidden sm:inline">YouTube</span>
                  </a>
                  <a href="https://www.instagram.com/komiserimpaemisyon/?igsh=MWJkNGpweTY0YWo4cw%3D%3D#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-pink-600 transition font-medium">
                    <i className="fab fa-instagram text-2xl"></i> <span className="hidden sm:inline">Instagram</span>
                  </a>
                  <a href="https://t.me/+CTjT_YdxM3tkYWE0" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-blue-500 transition font-medium">
                    <i className="fab fa-telegram-plane text-2xl"></i> <span className="hidden sm:inline">Telegram</span>
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        {view === 'USER_FOLDER_AUTH' && selectedFolderId && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl">
              <button onClick={() => setView('USER_LOGIN')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-2">
                <i className="fas fa-arrow-left"></i> Geri
              </button>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-lock text-3xl"></i>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Klasör Şifresi</h3>
                <p className="text-sm text-slate-500">"{folders.find(f => f.id === selectedFolderId)?.title}" klasörünü (ve yetkili olduğunuz diğer klasörleri) görüntülemek için şifrenizi giriniz.</p>
              </div>
              <form onSubmit={handleFolderLogin}>
                <input
                  type="password"
                  autoFocus
                  className="w-full text-center text-2xl tracking-widest p-3 border-b-2 border-slate-200 focus:border-blue-600 outline-none font-mono mb-6"
                  placeholder="******"
                  value={folderKeyInput}
                  onChange={(e) => setFolderKeyInput(e.target.value)}
                />
                <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">Giriş Yap</button>
              </form>
            </div>
          </div>
        )}

        {view === 'USER_FOLDER_VIEW' && navigationStack.length > 0 && (
          <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto p-4 py-8">
              {/* Header with Breadcrumb */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex items-center gap-4">
                <button onClick={handleNavigateBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition">
                  <i className="fas fa-arrow-left"></i>
                </button>
                <div className="flex items-center gap-2 text-lg font-bold text-slate-700 overflow-x-auto">
                  <span onClick={() => { setNavigationStack([]); setView('USER_LOGIN'); }} className="cursor-pointer hover:text-blue-600 text-slate-400">Derslerim</span>
                  {navigationStack.map((f, i) => (
                    <React.Fragment key={f.id}>
                      <i className="fas fa-chevron-right text-sm text-slate-300"></i>
                      <span onClick={() => {
                        // Navigate to this level
                        setNavigationStack(prev => prev.slice(0, i + 1));
                      }} className={`cursor-pointer ${i === navigationStack.length - 1 ? 'text-slate-800' : 'text-slate-400 hover:text-blue-600'}`}>{f.title}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Subfolders */}
                {folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).map(f => (
                  <button key={f.id} onClick={() => handleFolderClick(f)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-blue-300 flex items-center gap-3 text-left group">
                    <i className="fas fa-folder text-2xl text-yellow-400 group-hover:scale-110 transition"></i>
                    <span className="font-bold text-slate-700 group-hover:text-blue-600">{f.title}</span>
                  </button>
                ))}
              </div>
              {folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).length > 0 && <hr className="my-8 border-slate-200" />}

              {/* Files */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folderContent.filter(c => c.folderId === navigationStack[navigationStack.length - 1].id).map(item => (
                  <div key={item.id} onClick={() => handleContentClick(item)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer group transition">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl ${item.type === 'pdf' ? 'bg-red-500' : 'bg-blue-500'}`}>
                        <i className={`fas ${item.type === 'pdf' ? 'fa-file-pdf' : 'fa-link'}`}></i>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 group-hover:text-blue-600 line-clamp-2">{item.title}</h4>
                        <span className="text-xs text-slate-400 mt-1 block">{new Date(item.createdAt).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {folderContent.filter(c => c.folderId === navigationStack[navigationStack.length - 1].id).length === 0 && folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).length === 0 && (
                  <div className="col-span-3 text-center text-slate-400 py-12 bg-white rounded-xl border border-dashed border-slate-200">
                    Bu klasörde henüz içerik yok.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'ADMIN_LOGIN' && (
          <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
            <div className="text-center mb-8">
              <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-user-shield text-2xl text-slate-700"></i>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Yönetici Girişi</h1>
              <p className="text-slate-500 mt-2">Kütüphane ve anahtarları yönetin.</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Şifre</label>
                <input
                  type="password"
                  className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Yönetici şifresi"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  required
                />
              </div>
              <button className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold text-lg hover:bg-slate-900 shadow-lg shadow-slate-200 transition-all">
                Panale Gir
              </button>
            </form>
          </div>
        )}

        {view === 'ADMIN_DASHBOARD' && (
          <AdminDashboard onLogout={() => setView('ADMIN_LOGIN')} />
        )}

        {view === 'USER_VIEWER' && activeBook && activeKey && (
          <UserViewer
            book={activeBook}
            accessKey={activeKey}
            isDeviceVerified={isDeviceVerified}
            onExit={() => { setView('USER_LOGIN'); setActiveBook(null); setActiveKey(null); }}
          />
        )}
      </main>

      {/* Footer */}
      {view !== 'USER_VIEWER' && (
        <footer className="mt-20 text-center pb-8 px-4">
          <p className="text-slate-800 font-bold mb-1">SIRÇA AKADEMİ (KOMİSERİM PAEMİSYON)</p>
          <p className="text-blue-600 font-medium mb-4">Uygulama Şuheda SIRÇA tarafından yapılmıştır.</p>
          <p className="text-slate-400 text-xs">© 2025 • Güvenli Belge Dağıtım Sistemi</p>
        </footer>
      )}
    </div>
  );
};

export default App;
