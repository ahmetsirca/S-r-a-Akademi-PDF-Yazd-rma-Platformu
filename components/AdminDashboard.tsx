
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storage';
import { PDFBook, AccessKey, Collection } from '../types';

interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  // Tabs: 'KEYS' = Legacy Key Management, 'COURSES' = New Folder/Course Management
  const [adminTab, setAdminTab] = useState<'KEYS' | 'COURSES'>('KEYS');

  // -- EXISTING STATE (Keys) --
  const [collections, setCollections] = useState<Collection[]>([]);
  const [books, setBooks] = useState<PDFBook[]>([]);
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Existing Key inputs
  const [newColName, setNewColName] = useState('');
  const [selectedCol, setSelectedCol] = useState<string>('');
  const [newBookName, setNewBookName] = useState('');
  const [newBookPass, setNewBookPass] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'FILE' | 'LINK'>('FILE');
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [editKeyId, setEditKeyId] = useState<string | null>(null);
  const [newKeyPass, setNewKeyPass] = useState('');

  // -- NEW STATE (Derslerim/Folders) --
  const [folders, setFolders] = useState<import('../types').Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderContents, setFolderContents] = useState<import('../types').FolderContent[]>([]);
  const [folderKeys, setFolderKeys] = useState<import('../types').FolderKey[]>([]);

  // Folder inputs
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState<'pdf' | 'link'>('pdf');
  const [newItemFile, setNewItemFile] = useState<File | null>(null);
  const [newItemUrl, setNewItemUrl] = useState('');

  // Folder Key inputs
  const [newFolderKey, setNewFolderKey] = useState('');
  const [newFolderKeyNote, setNewFolderKeyNote] = useState('');

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    // Load Legacy Data
    setCollections(await StorageService.getCollections());
    setBooks(await StorageService.getBooks());
    setKeys(await StorageService.getKeys());

    // Load New Folder Data
    const foldersData = await StorageService.getFolders();
    setFolders(foldersData);

    // If a folder is active, refresh its content and keys
    if (activeFolderId) {
      setFolderContents(await StorageService.getFolderContent(activeFolderId));
      setFolderKeys(await StorageService.getFolderKeys(activeFolderId));
    }

    setIsLoading(false);
  };

  // --- LEGACY COLLECTIIONS HANDLERS ---
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName) return;
    await StorageService.saveCollection(newColName);
    setNewColName('');
    await refreshData();
  };

  const handleUploadBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookName || !selectedCol || !newBookPass) {
      alert("Lütfen temel bilgileri (Ad, Şifre, Klasör) doldurun.");
      return;
    }
    if (activeTab === 'FILE' && !bookFile) { alert("Lütfen bir PDF dosyası seçin."); return; }
    if (activeTab === 'LINK' && !linkUrl) { alert("Lütfen bir bağlantı (URL) girin."); return; }

    setIsLoading(true);
    try {
      if (activeTab === 'FILE' && bookFile) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          await saveBookAndRefresh({ name: newBookName, collectionId: selectedCol, pdfData: base64, sourceType: 'FILE' });
        };
        reader.readAsDataURL(bookFile);
      } else {
        await saveBookAndRefresh({ name: newBookName, collectionId: selectedCol, sourceUrl: linkUrl, sourceType: 'LINK' });
      }
    } catch (err) { console.error(err); alert("Hata oluştu."); setIsLoading(false); }
  };

  const saveBookAndRefresh = async (bookData: any) => {
    try {
      const savedBook = await StorageService.saveBook(bookData);
      await StorageService.saveKey(newBookPass, savedBook.id, 2);
      setNewBookName(''); setNewBookPass(''); setBookFile(null); setLinkUrl('');
      await refreshData();
      alert("İçerik başarıyla eklendi!");
    } catch (err) { console.error(err); alert("Kaydetme hatası."); } finally { setIsLoading(false); }
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
    setEditKeyId(null); setNewKeyPass(''); await refreshData();
  };

  // --- NEW FOLDER HANDLERS ---
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderTitle) return;
    setIsLoading(true);
    await StorageService.createFolder(newFolderTitle);
    setNewFolderTitle('');
    await refreshData();
    setIsLoading(false);
  };

  const handleDeleteFolder = async (id: string) => {
    if (confirm('Bu klasörü ve İÇİNDEKİ TÜM İÇERİKLERİ silmek istediğinize emin misiniz?')) {
      setIsLoading(true);
      await StorageService.deleteFolder(id);
      if (activeFolderId === id) setActiveFolderId(null);
      await refreshData();
      setIsLoading(false);
    }
  };

  const handleSelectFolder = async (id: string) => {
    setActiveFolderId(id);
    setIsLoading(true);
    setFolderContents(await StorageService.getFolderContent(id));
    setFolderKeys(await StorageService.getFolderKeys(id));
    setIsLoading(false);
  };

  const handleAddItemToFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolderId) return;
    if (!newItemTitle) return;
    if (newItemType === 'pdf' && !newItemFile) { alert("Lütfen dosya seçin"); return; }
    if (newItemType === 'link' && !newItemUrl) { alert("Lütfen URL girin"); return; }

    setIsLoading(true);
    try {
      let contentData = newItemUrl;
      if (newItemType === 'pdf' && newItemFile) {
        // Need base64
        const reader = new FileReader();
        reader.readAsDataURL(newItemFile);
        await new Promise((resolve) => {
          reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            await StorageService.addFolderItem(activeFolderId, 'pdf', newItemTitle, base64);
            resolve(true);
          }
        });
      } else {
        await StorageService.addFolderItem(activeFolderId, 'link', newItemTitle, newItemUrl);
      }

      setNewItemTitle(''); setNewItemFile(null); setNewItemUrl('');
      // Refresh active folder
      setFolderContents(await StorageService.getFolderContent(activeFolderId));
      alert('İçerik eklendi.');
    } catch (err) {
      console.error(err);
      alert('Hata');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFolderItem = async (id: string) => {
    if (!confirm('Silinsin mi?')) return;
    await StorageService.deleteFolderItem(id);
    if (activeFolderId) setFolderContents(await StorageService.getFolderContent(activeFolderId));
  };

  const handleCreateFolderKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolderId || !newFolderKey) return;
    try {
      await StorageService.createFolderKey(activeFolderId, newFolderKey, newFolderKeyNote);
      setNewFolderKey(''); setNewFolderKeyNote('');
      setFolderKeys(await StorageService.getFolderKeys(activeFolderId));
      alert('Şifre oluşturuldu.');
    } catch (e) {
      alert('Hata: Şifre çakışması olabilir.');
    }
  };

  const handleDeleteFolderKey = async (id: string) => {
    if (!confirm('Bu şifreyi silmek istediğinize emin misiniz?')) return;
    await StorageService.deleteFolderKey(id);
    if (activeFolderId) setFolderKeys(await StorageService.getFolderKeys(activeFolderId));
  };


  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Yönetici Paneli</h1>
          <p className="text-blue-600 font-medium tracking-wide">SIRÇA AKADEMİ YÖNETİM MERKEZİ</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setAdminTab('KEYS')}
              className={`px-4 py-2 text-sm font-bold rounded-md transition ${adminTab === 'KEYS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Erişim Anahtarları (Eski)
            </button>
            <button
              onClick={() => setAdminTab('COURSES')}
              className={`px-4 py-2 text-sm font-bold rounded-md transition ${adminTab === 'COURSES' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              DERSLERİM (Yeni)
            </button>
          </div>
          <button onClick={onLogout} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition shadow-red-200 shadow-lg">
            <i className="fas fa-sign-out-alt mr-2"></i> Çıkış
          </button>
        </div>
      </div>

      {adminTab === 'KEYS' ? (
        // --- LEGACY KEYS VIEW ---
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">Dosya/Klasör (Eski)</h2>
            <form onSubmit={handleCreateCollection} className="space-y-4">
              <input type="text" placeholder="Klasör Adı" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500" value={newColName} onChange={(e) => setNewColName(e.target.value)} />
              <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Klasör Ekle</button>
            </form>
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Mevcut Klasörler</h3>
              <ul className="space-y-2">{collections.map(c => <li key={c.id} className="p-2 bg-slate-50 rounded flex justify-between"><span><i className="fas fa-folder text-blue-500 mr-2"></i>{c.name}</span></li>)}</ul>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-slate-700">Tekil İçerik Ekle (Erişim Kodlu)</h2>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setActiveTab('FILE'); setBookFile(null); }} className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'FILE' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>PDF</button>
                <button onClick={() => { setActiveTab('LINK'); setBookFile(null); }} className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'LINK' ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}>Link</button>
              </div>
            </div>
            <form onSubmit={handleUploadBook} className="space-y-4">
              <input type="text" placeholder="Başlık" className="w-full border p-2 rounded" value={newBookName} onChange={(e) => setNewBookName(e.target.value)} required />
              {activeTab === 'LINK' ?
                <input type="url" placeholder="URL" className="w-full border p-2 rounded" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} required /> :
                <input type="file" accept="application/pdf" className="w-full border p-2 rounded" onChange={(e) => setBookFile(e.target.files?.[0] || null)} required />
              }
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Erişim Şifresi" className="border p-2 rounded" value={newBookPass} onChange={(e) => setNewBookPass(e.target.value)} required />
                <select className="border p-2 rounded" value={selectedCol} onChange={(e) => setSelectedCol(e.target.value)} required>
                  <option value="">Klasör Seç</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button disabled={isLoading} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">{isLoading ? 'Yükleniyor...' : 'Kaydet'}</button>
            </form>

            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-slate-50"><th className="p-3">Ad</th><th className="p-3">Kod</th><th className="p-3">Limit</th><th className="p-3">Sil</th></tr></thead>
                <tbody>
                  {books.map(b => {
                    const k = keys.find(k => k.bookId === b.id);
                    return (
                      <tr key={b.id} className="border-b">
                        <td className="p-3">{b.name}</td>
                        <td className="p-3 font-mono bg-slate-100 rounded">{k?.key}</td>
                        <td className="p-3">{k?.printCount}/{k?.printLimit}</td>
                        <td className="p-3"><button onClick={() => handleDeleteBook(b.id)} className="text-red-500"><i className="fas fa-trash"></i></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // --- NEW COURSES VIEW ---
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar: Folders */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-700 mb-4">Ders Klasörleri</h2>
            <form onSubmit={handleCreateFolder} className="flex gap-2 mb-6">
              <input type="text" placeholder="Yeni Ders Adı" className="w-full border p-2 rounded text-sm" value={newFolderTitle} onChange={(e) => setNewFolderTitle(e.target.value)} />
              <button className="bg-blue-600 text-white px-3 rounded hover:bg-blue-700">+</button>
            </form>
            <ul className="space-y-2">
              {folders.map(f => (
                <li key={f.id}
                  onClick={() => handleSelectFolder(f.id)}
                  className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition ${activeFolderId === f.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <span className="font-medium truncate"><i className={`fas ${activeFolderId === f.id ? 'fa-folder-open' : 'fa-folder'} mr-2`}></i>{f.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }} className="text-slate-400 hover:text-red-500"><i className="fas fa-trash-alt"></i></button>
                </li>
              ))}
            </ul>
          </div>

          {/* Main Content: Folder Details */}
          <div className="lg:col-span-3 space-y-8">
            {activeFolderId ? (
              <>
                {/* Add Content Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">İçerik Ekle ({folders.find(f => f.id === activeFolderId)?.title})</h3>
                  <form onSubmit={handleAddItemToFolder} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3">
                      <label className="text-xs font-bold text-slate-500">Tür</label>
                      <select className="w-full border p-2 rounded" value={newItemType} onChange={(e) => setNewItemType(e.target.value as any)}>
                        <option value="pdf">PDF Dosyası</option>
                        <option value="link">Web Linki</option>
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <label className="text-xs font-bold text-slate-500">İçerik Başlığı</label>
                      <input type="text" className="w-full border p-2 rounded" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder="Örn: Hafta 1 Notları" required />
                    </div>
                    <div className="md:col-span-4">
                      <label className="text-xs font-bold text-slate-500">{newItemType === 'pdf' ? 'Dosya' : 'URL'}</label>
                      {newItemType === 'pdf' ? (
                        <input type="file" accept="application/pdf" className="w-full text-sm" onChange={(e) => setNewItemFile(e.target.files?.[0] || null)} />
                      ) : (
                        <input type="url" className="w-full border p-2 rounded" value={newItemUrl} onChange={(e) => setNewItemUrl(e.target.value)} placeholder="https://..." />
                      )}
                    </div>
                    <div className="md:col-span-1">
                      <button disabled={isLoading} className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"><i className="fas fa-plus"></i></button>
                    </div>
                  </form>

                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-slate-500 mb-3">Mevcut İçerikler</h4>
                    {folderContents.length === 0 ? <p className="text-sm text-slate-400 italic">Henüz içerik yok.</p> : (
                      <ul className="space-y-2">
                        {folderContents.map(c => (
                          <li key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded border border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded flex items-center justify-center text-white ${c.type === 'pdf' ? 'bg-red-500' : 'bg-blue-500'}`}>
                                <i className={`fas ${c.type === 'pdf' ? 'fa-file-pdf' : 'fa-link'}`}></i>
                              </div>
                              <span className="font-medium text-slate-700">{c.title}</span>
                              <a href={c.url} target="_blank" className="text-xs text-blue-400 hover:underline truncate max-w-[200px]">{c.url}</a>
                            </div>
                            <button onClick={() => handleDeleteFolderItem(c.id)} className="text-red-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Keys Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Bu Sınıf İçin Erişimi Anahtarları</h3>
                  <p className="text-sm text-slate-500 mb-4">Bu klasöre erişmesini istediğiniz her öğrenci için özel bir şifre oluşturun.</p>

                  <form onSubmit={handleCreateFolderKey} className="flex gap-4 items-end mb-6">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-slate-500">Şifre (Otomatik veya Manuel)</label>
                      <input type="text" className="w-full border p-2 rounded font-mono" value={newFolderKey} onChange={(e) => setNewFolderKey(e.target.value)} placeholder="Örn: AHMET123" required />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-slate-500">Öğrenci Notu</label>
                      <input type="text" className="w-full border p-2 rounded" value={newFolderKeyNote} onChange={(e) => setNewFolderKeyNote(e.target.value)} placeholder="Örn: Ahmet Yılmaz" />
                    </div>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-bold">Oluştur</button>
                  </form>

                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600"><th className="p-2">Şifre</th><th className="p-2">Not</th><th className="p-2 text-right">Sil</th></tr>
                    </thead>
                    <tbody>
                      {folderKeys.map(k => (
                        <tr key={k.id} className="border-b">
                          <td className="p-2 font-mono font-bold text-blue-600">{k.keyCode}</td>
                          <td className="p-2">{k.note || '-'}</td>
                          <td className="p-2 text-right"><button onClick={() => handleDeleteFolderKey(k.id)} className="text-red-500"><i className="fas fa-trash"></i></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-12 border-2 border-dashed border-slate-200 rounded-xl">
                <i className="fas fa-folder-open text-6xl mb-4 text-slate-200"></i>
                <p>İşlem yapmak için soldan bir ders klasörü seçin veya yeni oluşturun.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
