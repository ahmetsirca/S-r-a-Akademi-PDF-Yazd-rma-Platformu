
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

  return (
    <div className="min-h-screen">
      {/* Nav */}
      {view !== 'USER_VIEWER' && (
        <nav className="p-4 flex justify-between items-center bg-white border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 w-8 h-8 rounded flex items-center justify-center text-white shadow-sm">
              <i className="fas fa-book-open"></i>
            </div>
            <span className="font-bold text-xl text-slate-800 tracking-tight">SIRÇA <span className="text-blue-600">AKADEMİ</span></span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setView('USER_LOGIN')}
              className={`text-sm font-medium transition ${view === 'USER_LOGIN' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
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
            <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
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

              {/* Social Media Links */}
              <div className="mt-8 flex justify-center gap-4">
                <a href="https://www.youtube.com/@komiserimpaemisyon" target="_blank" rel="noopener noreferrer" className="bg-red-600 hover:bg-red-700 text-white w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg shadow-red-200">
                  <i className="fab fa-youtube text-xl"></i>
                </a>
                <a href="https://www.instagram.com/komiserimpaemisyon/?igsh=MWJkNGpweTY0YWo4cw%3D%3D#" target="_blank" rel="noopener noreferrer" className="bg-gradient-to-tr from-yellow-400 to-purple-600 text-white w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg shadow-purple-200 hover:opacity-90">
                  <i className="fab fa-instagram text-xl"></i>
                </a>
                <a href="https://t.me/+CTjT_YdxM3tkYWE0" target="_blank" rel="noopener noreferrer" className="bg-blue-500 hover:bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg shadow-blue-200">
                  <i className="fab fa-telegram-plane text-xl"></i>
                </a>
              </div>
            </div>

            {/* YouTube Feed Slider/Embed */}
            <div className="max-w-4xl mx-auto mt-12 mb-20">
              <div className="flex items-center gap-3 mb-6 px-4">
                <i className="fab fa-youtube text-red-600 text-3xl"></i>
                <h2 className="text-2xl font-bold text-slate-800">Komiserim Paemisyon</h2>
              </div>
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 aspect-video mx-4 md:mx-0 relative">
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed?listType=user_uploads&list=komiserimpaemisyon"
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </>
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
