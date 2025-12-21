
import React, { useState } from 'react';
import { ViewState, PDFBook, AccessKey } from './types';
import { StorageService } from './services/storage';
import AdminDashboard from './components/AdminDashboard';
import UserViewer from './components/UserViewer';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('USER_LOGIN');
  const [adminInput, setAdminInput] = useState('');
  const [userKeyInput, setUserKeyInput] = useState('');

  const [activeBook, setActiveBook] = useState<PDFBook | null>(null);
  const [activeKey, setActiveKey] = useState<AccessKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // -- DERSLERIM STATE --
  const [folders, setFolders] = useState<import('./types').Folder[]>([]);
  const [folderKeyInput, setFolderKeyInput] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null); // For password prompt
  const [openFolderId, setOpenFolderId] = useState<string | null>(null); // For viewing contents
  const [folderContents, setFolderContents] = useState<import('./types').FolderContent[]>([]);
  const [activeFolderKey, setActiveFolderKey] = useState<import('./types').FolderKey | null>(null);

  React.useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    const f = await StorageService.getFolders();
    setFolders(f);
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

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Supabase: Verify key directly
      const match = await StorageService.verifyKey(userKeyInput);

      if (match) {
        // Now fetch books asynchronously
        const books = await StorageService.getBooks();
        const book = books.find(b => b.id === match.bookId);

        if (book) {
          setActiveBook(book);
          setActiveKey(match);
          setView('USER_VIEWER');
          setUserKeyInput('');
        } else {
          alert('Bu anahtar için kitap bulunamadı (Silinmiş olabilir).');
        }
      } else {
        alert('Geçersiz Erişim Anahtarı.');
      }
    } catch (err) {
      console.error(err);
      alert('Bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  // -- FOLDER HANDLERS --
  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
    setFolderKeyInput('');
  };

  const handleFolderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderId) return;
    setIsLoading(true);
    try {
      const isValid = await StorageService.verifyFolderKey(selectedFolderId, folderKeyInput);
      if (isValid) {
        setOpenFolderId(selectedFolderId);
        setFolderContents(await StorageService.getFolderContent(selectedFolderId));
        setSelectedFolderId(null); // Close modal
        setView('USER_FOLDER_VIEW'); // Switch view
      } else {
        alert('Hatalı Şifre!');
      }
    } catch (e) {
      alert('Hata');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentClick = (content: import('./types').FolderContent) => {
    if (content.type === 'link') {
      window.open(content.url, '_blank');
    } else {
      // Open PDF in Secure Viewer
      // Mocking a PDFBook object for compatibility
      const mockBook: PDFBook = {
        id: content.id,
        name: content.title,
        collectionId: content.folderId,
        sourceType: 'FILE',
        sourceUrl: content.url,
        createdAt: Date.now()
      };
      // Mock access key (unlimited for folder items)
      const mockKey: AccessKey = {
        id: 'folder-access',
        key: 'folder-key',
        bookId: content.id,
        printLimit: 9999,
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
              {/* Left: Access Key Login */}
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 h-fit">
                <div className="text-center mb-8">
                  <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-key text-2xl text-blue-600"></i>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-800">Kitabını Aç</h1>
                  <p className="text-slate-500 mt-2">Size verilen erişim anahtarını girin.</p>
                </div>
                <form onSubmit={handleUserLogin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Erişim Anahtarı</label>
                    <input
                      type="password"
                      className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                      placeholder="••••••••"
                      value={userKeyInput}
                      onChange={(e) => setUserKeyInput(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    disabled={isLoading}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Yükleniyor...' : 'PDF\'e Eriş'}
                  </button>
                </form>
                <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-sm">
                  <i className="fas fa-shield-alt"></i>
                  <span>Güvenli, sadece yazdırılabilir ortam</span>
                </div>
              </div>

              {/* Right: Derslerim (Folders) */}
              <div>
                <div className="mb-6 flex items-center gap-2">
                  <i className="fas fa-chalkboard-teacher text-blue-600 text-2xl"></i>
                  <h2 className="text-2xl font-bold text-slate-800">Derslerim</h2>
                </div>

                {folders.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-200 border-dashed">
                    <p className="text-slate-400">Henüz ders klasörü eklenmemiş.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {folders.map(f => (
                      <div
                        key={f.id}
                        onClick={() => handleFolderClick(f.id)}
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
                  </div>
                )}
              </div>
            </div>

            {/* Social Media Links - Horizontal Bar */}
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

            {/* Password Modal */}
            {selectedFolderId && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full relative">
                  <button onClick={() => setSelectedFolderId(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <i className="fas fa-times text-xl"></i>
                  </button>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-lock text-3xl"></i>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Klasör Şifresi</h3>
                    <p className="text-sm text-slate-500">"{folders.find(f => f.id === selectedFolderId)?.title}" klasörünü görüntülemek için şifrenizi giriniz.</p>
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
          </>
        )}

        {view === 'USER_FOLDER_VIEW' && (
          <div className="max-w-5xl mx-auto px-4 py-8">
            <button onClick={() => { setView('USER_LOGIN'); setOpenFolderId(null); }} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 transition font-medium">
              <i className="fas fa-arrow-left"></i> Geri Dön
            </button>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 min-h-[50vh]">
              <div className="mb-8 border-b pb-4">
                <h1 className="text-3xl font-bold text-slate-800">{folders.find(f => f.id === openFolderId)?.title}</h1>
                <p className="text-slate-500">Ders İçerikleri</p>
              </div>

              {folderContents.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <i className="fas fa-folder-open text-4xl mb-3 opacity-50"></i>
                  <p>Bu klasörde henüz içerik yok.</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {folderContents.map(c => (
                    <div key={c.id} onClick={() => handleContentClick(c)} className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 p-4 rounded-xl cursor-pointer transition group flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white ${c.type === 'pdf' ? 'bg-red-500 shadow-md shadow-red-200' : 'bg-blue-500 shadow-md shadow-blue-200'}`}>
                        <i className={`fas ${c.type === 'pdf' ? 'fa-file-pdf' : 'fa-link'} text-xl`}></i>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 group-hover:text-blue-700 line-clamp-1">{c.title}</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500 mt-1 inline-block">
                          {c.type === 'pdf' ? 'PDF DOKÜMAN' : 'WEB BAĞLANTISI'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            onExit={() => { setView('USER_LOGIN'); setActiveBook(null); setActiveKey(null); }}
          />
        )}
      </main>

      {/* Footer with credit */}
      {
        view !== 'USER_VIEWER' && (
          <footer className="mt-20 text-center pb-8 px-4">
            <p className="text-slate-800 font-bold mb-1">SIRÇA AKADEMİ (KOMİSERİM PAEMİSYON)</p>
            <p className="text-blue-600 font-medium mb-4">Uygulama Şuheda SIRÇA tarafından yapılmıştır.</p>
            <p className="text-slate-400 text-xs">© 2025 • Güvenli Belge Dağıtım Sistemi</p>
          </footer>
        )
      }
    </div >
  );
};

export default App;
