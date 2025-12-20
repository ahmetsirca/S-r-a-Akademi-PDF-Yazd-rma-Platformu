
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storage';
import { PDFBook, AccessKey, Collection } from '../types';

interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [books, setBooks] = useState<PDFBook[]>([]);
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [newColName, setNewColName] = useState('');
  const [selectedCol, setSelectedCol] = useState<string>('');
  const [newBookName, setNewBookName] = useState('');
  const [newBookPass, setNewBookPass] = useState('');
  const [linkUrl, setLinkUrl] = useState(''); // New state for Link URL
  const [activeTab, setActiveTab] = useState<'FILE' | 'LINK'>('FILE'); // Toggle state
  const [bookFile, setBookFile] = useState<File | null>(null);

  const [editKeyId, setEditKeyId] = useState<string | null>(null);
  const [newKeyPass, setNewKeyPass] = useState('');

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    setCollections(await StorageService.getCollections());
    const booksData = await StorageService.getBooks();
    setBooks(booksData);
    setKeys(await StorageService.getKeys());
    setIsLoading(false);
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName) return;
    await StorageService.saveCollection(newColName);
    setNewColName('');
    await refreshData();
  };

  const handleUploadBook = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newBookName || !selectedCol || !newBookPass) {
      alert("Lütfen temel bilgileri (Ad, Şifre, Klasör) doldurun.");
      return;
    }

    if (activeTab === 'FILE' && !bookFile) {
      alert("Lütfen bir PDF dosyası seçin.");
      return;
    }
    if (activeTab === 'LINK' && !linkUrl) {
      alert("Lütfen bir bağlantı (URL) girin.");
      return;
    }

    setIsLoading(true);

    try {
      if (activeTab === 'FILE' && bookFile) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          await saveBookAndRefresh({
            name: newBookName,
            collectionId: selectedCol,
            pdfData: base64,
            sourceType: 'FILE'
          });
        };
        reader.readAsDataURL(bookFile);
      } else {
        // LINK
        await saveBookAndRefresh({
          name: newBookName,
          collectionId: selectedCol,
          sourceUrl: linkUrl,
          sourceType: 'LINK'
        });
      }
    } catch (err) {
      console.error(err);
      alert("Hata oluştu.");
      setIsLoading(false);
    }
  };

  const saveBookAndRefresh = async (bookData: any) => {
    try {
      const savedBook = await StorageService.saveBook(bookData);
      await StorageService.saveKey(newBookPass, savedBook.id, 2);

      setNewBookName('');
      setNewBookPass('');
      setBookFile(null);
      setLinkUrl('');
      await refreshData();
      alert("İçerik başarıyla eklendi!");
    } catch (err) {
      console.error(err);
      alert("Kaydetme hatası.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (confirm('Bu kitabı silmek istediğinize emin misiniz?')) {
      setIsLoading(true);
      await StorageService.deleteBook(id);
      await refreshData();
      setIsLoading(false);
    }
  };

  const handleUpdateKey = async (keyId: string) => {
    if (!newKeyPass) return;
    await StorageService.updateKeyPassword(keyId, newKeyPass);
    setEditKeyId(null);
    setNewKeyPass('');
    await refreshData();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-8 text-center sm:text-left flex-col sm:row gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Yönetici Paneli</h1>
          <p className="text-blue-600 font-medium">SIRÇA AKADEMİ</p>
        </div>
        <button onClick={onLogout} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">
          <i className="fas fa-sign-out-alt mr-2"></i> Çıkış Yap
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Collection Management */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold mb-4 text-slate-700">Dosya Oluştur</h2>
          <form onSubmit={handleCreateCollection} className="space-y-4">
            <input
              type="text"
              placeholder="Klasör Adı"
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
            />
            <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
              Klasör Ekle
            </button>
          </form>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Mevcut Klasörler</h3>
            <ul className="space-y-2">
              {collections.map(c => (
                <li key={c.id} className="p-2 bg-slate-50 rounded flex justify-between items-center">
                  <span><i className="fas fa-folder text-blue-500 mr-2"></i>{c.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Book Upload */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-700">İçerik Ekle</h2>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => { setActiveTab('FILE'); setBookFile(null); setNewBookName(''); }}
                className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'FILE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <i className="fas fa-file-pdf mr-2"></i>PDF Yükle
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('LINK'); setBookFile(null); setNewBookName(''); }}
                className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'LINK' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <i className="fas fa-link mr-2"></i>Link Ekle
              </button>
            </div>
          </div>

          <form onSubmit={handleUploadBook} className="space-y-4">
            <input
              type="text"
              placeholder={activeTab === 'FILE' ? "Kitap Başlığı" : "Drive/İçerik Başlığı"}
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500"
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              required
            />

            {activeTab === 'LINK' && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <i className="fas fa-globe text-slate-400"></i>
                </div>
                <input
                  type="url"
                  placeholder="Örn: https://drive.google.com/file/d/..."
                  className="w-full pl-10 border p-2 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  required
                />
              </div>
            )}

            <input
              type="text"
              placeholder="Erişim Şifresi Belirle"
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              value={newBookPass}
              onChange={(e) => setNewBookPass(e.target.value)}
              required
            />
            <select
              className="w-full border p-2 rounded"
              value={selectedCol}
              onChange={(e) => setSelectedCol(e.target.value)}
              required
            >
              <option value="">Klasör Seçin</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {activeTab === 'FILE' && (
              <div className="border-2 border-dashed border-slate-300 p-4 text-center rounded-lg hover:border-blue-500 transition cursor-pointer relative">
                <input
                  type="file"
                  accept="application/pdf"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => setBookFile(e.target.files?.[0] || null)}
                  required
                />
                <i className="fas fa-cloud-upload-alt text-2xl text-slate-400 mb-2"></i>
                <p className="text-xs text-slate-500">{bookFile ? bookFile.name : 'PDF Seçin'}</p>
              </div>
            )}

            <button
              disabled={isLoading}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition disabled:opacity-50"
            >
              {isLoading ? 'Yükleniyor...' : (activeTab === 'FILE' ? 'Kitabı Yükle' : 'Linki Kaydet')}
            </button>
          </form>
        </div>

        {/* Book & Key Management List */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-3">
          <h2 className="text-xl font-semibold mb-4 text-slate-700">Kütüphane ve Erişim Anahtarları</h2>
          {isLoading && books.length === 0 ? (
            <p className="text-center p-4 text-slate-400">Yükleniyor...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 font-semibold text-slate-600">Kitap Adı</th>
                    <th className="p-3 font-semibold text-slate-600">Klasör</th>
                    <th className="p-3 font-semibold text-slate-600">Erişim Şifresi</th>
                    <th className="p-3 font-semibold text-slate-600">Kullanım (Çıktı)</th>
                    <th className="p-3 font-semibold text-slate-600 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map(book => {
                    const bookKey = keys.find(k => k.bookId === book.id);
                    const col = collections.find(c => c.id === book.collectionId);
                    return (
                      <tr key={book.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className="p-3 font-medium">{book.name}</td>
                        <td className="p-3 text-slate-500">{col?.name || 'Bilinmiyor'}</td>
                        <td className="p-3">
                          {editKeyId === bookKey?.id ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                className="border px-2 py-1 rounded text-sm w-32"
                                value={newKeyPass}
                                onChange={(e) => setNewKeyPass(e.target.value)}
                              />
                              <button onClick={() => handleUpdateKey(bookKey!.id)} className="text-green-600 text-sm font-bold">Kaydet</button>
                              <button onClick={() => setEditKeyId(null)} className="text-red-600 text-sm font-bold">İptal</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <code className="bg-slate-200 px-2 py-1 rounded">{bookKey?.key || 'Şifre Yok'}</code>
                              <button onClick={() => { setEditKeyId(bookKey?.id || null); setNewKeyPass(bookKey?.key || ''); }} className="text-blue-500 text-xs hover:underline">Şifreyi Değiş</button>
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${bookKey && bookKey.printCount >= bookKey.printLimit ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {bookKey?.printCount || 0} / {bookKey?.printLimit || 2}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteBook(book.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
