import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storage';
import { PDFBook, AccessKey, Collection } from '../types';

import { QuestionParser, ParsedQuestion } from '../utils/QuestionParser';
import { QuizService } from '../services/db';

// Static imports to restore functionality
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';


interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  // Tabs: 'KEYS' = Legacy Key Management, 'COURSES' = New Folder/Course Management, 'USERS' = User Management, 'LOGS' = Activity Logs, 'QUIZ' = Quiz Upload
  const [adminTab, setAdminTab] = useState<'KEYS' | 'COURSES' | 'USERS' | 'LOGS' | 'QUIZ'>('KEYS');

  // -- QUIZ STATE --
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [isParsing, setIsParsing] = useState(false);

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
  const [allFiles, setAllFiles] = useState<import('../types').FolderContent[]>([]); // NEW

  // Folder inputs
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState<'pdf' | 'link'>('pdf');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [newItemFile, setNewItemFile] = useState<File | null>(null);

  // Key inputs
  const [selectedFolderIdsForKey, setSelectedFolderIdsForKey] = useState<string[]>([]);
  const [selectedFileIdsForKey, setSelectedFileIdsForKey] = useState<string[]>([]);
  const [newFolderKey, setNewFolderKey] = useState('');
  const [newFolderKeyNote, setNewFolderKeyNote] = useState('');
  const [keyExpiresAt, setKeyExpiresAt] = useState('');
  const [allowPrint, setAllowPrint] = useState(false);


  // -- USER MANAGEMENT STATE --
  const [users, setUsers] = useState<import('../types').UserProfile[]>([]);
  const [activityLogs, setActivityLogs] = useState<import('../types').ActivityLog[]>([]);
  const [selectedUser, setSelectedUser] = useState<import('../types').UserProfile | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);

  // Permission Inputs
  const [permFolderIds, setPermFolderIds] = useState<string[]>([]);
  const [permFileIds, setPermFileIds] = useState<string[]>([]); // NEW
  const [permCanPrint, setPermCanPrint] = useState(false);
  const [permPrintLimits, setPermPrintLimits] = useState<Record<string, number>>({}); // NEW
  const [permExpiresAt, setPermExpiresAt] = useState('');


  // Device Management State
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [userDevices, setUserDevices] = useState<any[]>([]);

  // Auto-refresh for online status
  useEffect(() => {
    const interval = setInterval(() => {
      if (adminTab === 'USERS') refreshUsers();
    }, 10000); // 10s polling for online status
    return () => clearInterval(interval);
  }, [adminTab]);

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
    setAllFiles(await StorageService.getAllFiles()); // NEW

    // If a folder is active, refresh its content
    if (activeFolderId) {
      setFolderContents(await StorageService.getFolderContent(activeFolderId));
    }
    // Refresh ALL keys (they are now global)
    setFolderKeys(await StorageService.getFolderKeys());

    setIsLoading(false);
  };

  const refreshUsers = async () => {
    setUsers(await import('../services/db').then(m => m.DBService.getAllUsers()));
  }


  const handleOpenPermModal = async (user: import('../types').UserProfile) => {
    setSelectedUser(user);
    // Fetch existing perms
    const perms = await import('../services/db').then(m => m.DBService.getUserPermissions(user.id));

    if (perms) {
      setPermFolderIds(perms.folderIds);
      setPermFileIds(perms.allowedFileIds);
      setPermCanPrint(perms.canPrint);
      setPermPrintLimits(perms.printLimits || {});
      setPermExpiresAt(perms.expiresAt ? perms.expiresAt.slice(0, 16) : ''); // Format for datetime-local
    } else {
      setPermFolderIds([]);
      setPermFileIds([]);
      setPermCanPrint(false);
      setPermPrintLimits({});
      setPermExpiresAt('');
    }
    setPermModalOpen(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    try {
      const result = await import('../services/db').then(m => m.DBService.updateUserPermission(
        selectedUser.id,
        permFolderIds,
        permFileIds,
        permCanPrint,
        permExpiresAt ? new Date(permExpiresAt).toISOString() : null,
        permPrintLimits
      ));

      if (result.error) {
        console.error("Supabase Update Error:", result.error);
        alert(`Güncelleme başarısız: ${result.error.message || 'Veritabanı hatası'} `);
        return;
      }

      setPermModalOpen(false);
      alert("İzinler güncellendi.");
    } catch (e: any) { console.error(e); alert(`Hata oluştu: ${e.message} `); }
  };

  const handleOpenDeviceModal = async (user: import('../types').UserProfile) => {
    setSelectedUser(user);
    const devices = await import('../services/db').then(m => m.DBService.getUserDevices(user.id));
    setUserDevices(devices);
    setDeviceModalOpen(true);
  };

  const handleToggleDevice = async (deviceId: string, currentStatus: boolean) => {
    await import('../services/db').then(m => m.DBService.toggleDeviceApproval(deviceId, !currentStatus));
    if (selectedUser) {
      const devices = await import('../services/db').then(m => m.DBService.getUserDevices(selectedUser.id));
      setUserDevices(devices);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm("Cihaz silinsin mi?")) return;
    await import('../services/db').then(m => m.DBService.deleteDevice(deviceId));
    if (selectedUser) {
      const devices = await import('../services/db').then(m => m.DBService.getUserDevices(selectedUser.id));
      setUserDevices(devices);
    }
  };

  const loadLogs = async () => {
    setIsLoading(true);
    setActivityLogs(await import('../services/db').then(m => m.DBService.getActivityLogs()));
    setIsLoading(false);
  };

  // Re-fetch when switching tabs
  useEffect(() => {
    if (adminTab === 'USERS') refreshUsers();
    if (adminTab === 'LOGS') loadLogs();
  }, [adminTab]);

  // --- LEGACY COLLECTIIONS HANDLERS ---

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName) return;
    await StorageService.saveCollection(newColName);
    setNewColName('');
    await refreshData();
  };

  const handleDeleteCollection = async (id: string) => {
    if (confirm('Bu klasörü silmek istediğinize emin misiniz? İçindeki dosyalar silinmeyecek ama erişilemez olabilir.')) {
      setIsLoading(true);
      await StorageService.deleteCollection(id);
      await refreshData();
      setIsLoading(false);
    }
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
    // Create folder as child of activeFolderId if exists, or root
    await StorageService.createFolder(newFolderTitle, activeFolderId);
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
    // Refresh content for new active folder
    setFolderContents(await StorageService.getFolderContent(id));
    // Keys are global now, but we could filter if we wanted. For now keeping global list.
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
    if ((selectedFolderIdsForKey.length === 0 && selectedFileIdsForKey.length === 0) || !newFolderKey) {
      alert("Lütfen en az bir klasör/dosya ve şifre girin.");
      return;
    }
    try {
      await StorageService.createFolderKey(
        selectedFolderIdsForKey,
        selectedFileIdsForKey, // NEW
        newFolderKey.trim(),
        newFolderKeyNote,
        keyExpiresAt ? new Date(keyExpiresAt) : null,
        allowPrint
      );
      setNewFolderKey(''); setNewFolderKeyNote(''); setKeyExpiresAt(''); setSelectedFolderIdsForKey([]); setSelectedFileIdsForKey([]); setAllowPrint(false);
      setFolderKeys(await StorageService.getFolderKeys());
      alert('Şifre oluşturuldu.');
    } catch (e: any) {
      console.error(e);
      alert('Hata: ' + (e.message || 'Şifre çakışması veya bağlantı hatası.'));
    }
  };

  const handleDeleteFolderKey = async (id: string) => {
    if (!confirm('Bu şifreyi silmek istediğinize emin misiniz?')) return;
    await StorageService.deleteFolderKey(id);
    setFolderKeys(await StorageService.getFolderKeys());
  };

  // -- QUIZ HANDLERS --
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setQuizFile(file);
    setIsParsing(true);
    setParsedQuestions([]);

    try {
      let text = '';
      if (file.name.endsWith('.pdf')) {
        // Use static pdfjsLib
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        text = fullText;

      } else if (file.name.endsWith('.docx')) {
        // Use static mammoth
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }

      const questions = QuestionParser.parse(text);
      setParsedQuestions(questions);

    } catch (error: any) {
      console.error("Parsing error:", error);
      alert("Dosya okunurken hata oluştu: " + error.message);
    } finally {
      setIsParsing(false);
    }
  };


  const handleSaveQuiz = async () => {
    if (parsedQuestions.length === 0) return;
    try {
      await QuizService.createQuestionsBulk(parsedQuestions);
      alert(`${parsedQuestions.length} soru başarıyla kaydedildi!`);
      setParsedQuestions([]);
      setQuizFile(null);
    } catch (error: any) {
      console.error("Save error:", error);
      alert("Kaydetme hatası: " + error.message);
    }
  };


  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          <i className="fas fa-shield-alt text-blue-600 mr-3"></i>
          Yönetici Paneli
        </h1>
        <button onClick={onLogout} className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-xl text-sm font-bold transition flex items-center">
          <i className="fas fa-sign-out-alt mr-2"></i> Çıkış
        </button>
      </div>

      {/* Sub-Navigation */}
      < div className="flex justify-center mb-8" >
        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 inline-flex">
          <button onClick={() => setAdminTab('KEYS')} className={`px - 6 py - 2 rounded - lg text - sm font - bold transition ${adminTab === 'KEYS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} `}>
            <i className="fas fa-key mr-2"></i>Eski Anahtarlar
          </button>
          <button onClick={() => setAdminTab('COURSES')} className={`px - 6 py - 2 rounded - lg text - sm font - bold transition ${adminTab === 'COURSES' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} `}>
            <i className="fas fa-folder-tree mr-2"></i>Dersler
          </button>
          <button onClick={() => setAdminTab('USERS')} className={`px - 6 py - 2 rounded - lg text - sm font - bold transition ${adminTab === 'USERS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} `}>
            <i className="fas fa-users mr-2"></i>Kullanıcılar
          </button>
          <button onClick={() => setAdminTab('LOGS')} className={`px - 6 py - 2 rounded - lg text - sm font - bold transition ${adminTab === 'LOGS' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} `}>
            <i className="fas fa-history mr-2"></i>Loglar
          </button>
          <button onClick={() => setAdminTab('QUIZ')} className={`px-6 py-2 rounded-lg text-sm font-bold transition ${adminTab === 'QUIZ' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <i className="fas fa-question-circle mr-2"></i>Sınav Yükle (YENİ)
          </button>
        </div>
      </div >

      {adminTab === 'USERS' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Kullanıcı Yönetimi</h2>
            <button onClick={refreshUsers} className="text-blue-600 hover:text-blue-800"><i className="fas fa-sync-alt"></i></button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b"><th className="p-4">Kullanıcı</th><th className="p-4">Durum</th><th className="p-4">Son Görülme</th><th className="p-4 text-right">İşlem</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b hover:bg-slate-50">
                  <td className="p-4 flex items-center gap-3">
                    <img src={u.avatarUrl || `https://ui-avatars.com/api/?name=${u.fullName || u.email}`} className="w-10 h-10 rounded-full" />
                    <div>
                      <div className="font-bold text-slate-800">{u.fullName || 'Adsız'}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </td >
                  <td className="p-4">
                    {u.isOnline
                      ? <span className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>Aktif</span>
                      : <span className="text-slate-400 text-xs font-medium">Çevrimdışı</span>
                    }
                  </td>
                  <td className="p-4 text-sm text-slate-600">{u.lastSeen ? new Date(u.lastSeen).toLocaleString() : '-'}</td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button onClick={() => handleOpenDeviceModal(u)} className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-bold transition">
                      <i className="fas fa-desktop mr-2"></i>Cihazlar
                    </button>
                    <button onClick={() => handleOpenPermModal(u)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-bold transition">
                      <i className="fas fa-lock-open mr-2"></i>İzinler
                    </button>
                    <button onClick={() => {
                      const newPass = prompt(`"${u.fullName}" için yeni şifre belirleyin:`);
                      if (newPass) {
                        import('../services/auth').then(m => m.AuthService.adminResetPassword(u.id, newPass))
                          .then(() => alert('Şifre güncellendi.'))
                          .catch(e => alert('Hata: ' + e.message));
                      }
                    }} className="bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded-lg text-sm font-bold transition">
                      <i className="fas fa-key mr-2"></i>Şifre
                    </button>
                  </td>
                </tr >
              ))}
            </tbody >
          </table >
        </div >
      )}

      {
        adminTab === 'LOGS' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Aktivite Logları</h2>
              <button onClick={loadLogs} className="text-blue-600 hover:text-blue-800"><i className="fas fa-sync-alt"></i></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b"><th className="p-3">Zaman</th><th className="p-3">Kullanıcı</th><th className="p-3">İşlem</th><th className="p-3">Detay</th></tr>
                </thead>
                <tbody>
                  {activityLogs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-slate-50 font-mono">
                      <td className="p-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-3 font-bold text-slate-700">{log.userEmail}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded textxs font-bold ${log.actionType === 'LOGIN' ? 'bg-green-100 text-green-700' :
                          log.actionType === 'PRINT_FILE' ? 'bg-red-100 text-red-700' :
                            log.actionType === 'VIEW_FILE' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                          }`}>
                          {log.actionType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 truncatemax-w-xs">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      {/* Permission Modal */}
      {
        permModalOpen && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-6 border-b flex items-center gap-4 bg-slate-50">
                <img src={selectedUser.avatarUrl || ''} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{selectedUser.fullName}</h3>
                  <p className="text-sm text-slate-500">{selectedUser.email}</p>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Erişim İzni Verilecek Dersler</label>
                  <div className="max-h-60 overflow-y-auto border rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50">
                    {folders.map(f => (
                      <label key={f.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition ${permFolderIds.includes(f.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent'}`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 rounded"
                          checked={permFolderIds.includes(f.id)}
                          onChange={(e) => {
                            if (e.target.checked) setPermFolderIds(prev => [...prev, f.id]);
                            else setPermFolderIds(prev => prev.filter(id => id !== f.id));
                          }}
                        />
                        <i className="fas fa-folder text-yellow-500"></i>
                        <span className="text-sm font-medium text-slate-700">{f.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Erişim İzni Verilecek Özel Dosyalar</label>
                  <div className="max-h-60 overflow-y-auto border rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50">
                    {allFiles.map(f => {
                      const isSelected = permFileIds.includes(f.id);
                      return (
                        <div key={f.id} className={`flex flex-col p-2 rounded border transition ${isSelected ? 'bg-green-50 border-green-200' : 'bg-white border-transparent'}`}>
                          <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-green-600 rounded"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setPermFileIds(prev => [...prev, f.id]);
                                else {
                                  setPermFileIds(prev => prev.filter(id => id !== f.id));
                                  // Optional: Clear limit when unchecked
                                  setPermPrintLimits(prev => {
                                    const next = { ...prev };
                                    delete next[f.id];
                                    return next;
                                  });
                                }
                              }}
                            />
                            <i className={`fas ${f.type === 'pdf' ? 'fa-file-pdf text-red-500' : 'fa-link text-blue-500'}`}></i>
                            <span className="text-sm font-medium text-slate-700 truncate">{f.title}</span>
                          </label>

                          {isSelected && f.type === 'pdf' && (
                            <div className="flex items-center gap-2 ml-6">
                              <span className="text-xs text-slate-500">Yazdırma Hakkı:</span>
                              <input
                                type="number"
                                min="0"
                                className="w-16 p-1 text-xs border rounded text-center font-bold"
                                placeholder="0"
                                value={permPrintLimits[f.id] ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setPermPrintLimits(prev => ({ ...prev, [f.id]: val }));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {allFiles.length === 0 && <p className="text-xs text-slate-400 p-2 text-center col-span-2">Sistemde hiç dosya yok.</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Erişim Bitiş Tarihi</label>
                    <input type="datetime-local" className="w-full border p-2 rounded-lg" value={permExpiresAt} onChange={(e) => setPermExpiresAt(e.target.value)} />
                    <p className="text-[10px] text-slate-400 mt-1">Boş bırakılırsa süresiz erişim.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Yazdırma Hakkı</label>
                    <div className="flex items-center gap-3 p-2 border rounded-lg bg-white">
                      <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${permCanPrint ? 'bg-green-500' : 'bg-slate-300'}`} onClick={() => setPermCanPrint(!permCanPrint)}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${permCanPrint ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </div>
                      <span className="text-sm font-bold text-slate-700">{permCanPrint ? 'Yazdırabilir' : 'Yazdıramaz'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
                <button onClick={() => setPermModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition">İptal</button>
                <button onClick={handleSavePermissions} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition">Kaydet</button>
              </div>
            </div>
          </div>
        )
      }

      {
        deviceModalOpen && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-6 border-b flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-4">
                  <img src={selectedUser.avatarUrl || ''} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{selectedUser.fullName} - Cihazlar</h3>
                    <p className="text-sm text-slate-500">Kayıtlı IP Adresleri</p>
                  </div>
                </div>
                <button onClick={() => setDeviceModalOpen(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times text-xl"></i></button>
              </div>
              <div className="p-0">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr><th className="p-4">IP Adresi</th><th className="p-4">Son Erişim</th><th className="p-4">Durum</th><th className="p-4 text-right">İşlem</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {userDevices.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-4 font-mono text-sm">{d.ip_address}</td>
                        <td className="p-4 text-sm text-slate-500">{new Date(d.last_used_at).toLocaleString()}</td>
                        <td className="p-4">
                          {d.is_approved ?
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Onaylı</span> :
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold animate-pulse">Onay Bekliyor</span>
                          }
                        </td>
                        <td className="p-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => handleToggleDevice(d.id, d.is_approved)}
                            className={`px-3 py-1 rounded text-xs font-bold transition ${d.is_approved ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-500 text-white hover:bg-green-600'}`}
                          >
                            {d.is_approved ? 'Yasakla' : 'Onayla'}
                          </button>
                          <button onClick={() => handleDeleteDevice(d.id)} className="text-slate-400 hover:text-red-500"><i className="fas fa-trash"></i></button>
                        </td>
                      </tr>
                    ))}
                    {userDevices.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Kayıtlı cihaz yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      }

      {
        adminTab === 'KEYS' && (
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
                <ul className="space-y-2">
                  {collections.map(c => (
                    <li key={c.id} className="p-2 bg-slate-50 rounded flex justify-between items-center group">
                      <span><i className="fas fa-folder text-blue-500 mr-2"></i>{c.name}</span>
                      <button onClick={() => handleDeleteCollection(c.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition" title="Sil">
                        <i className="fas fa-trash"></i>
                      </button>
                    </li>
                  ))}
                </ul>
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
        )
      }

      {
        adminTab === 'COURSES' && (
          // --- NEW COURSES VIEW ---
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar: Folders Tree */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1">
              <h2 className="text-lg font-bold text-slate-700 mb-4">Ders Klasörleri</h2>

              {/* Create Folder Form */}
              <form onSubmit={handleCreateFolder} className="mb-6 border-b pb-4">
                <label className="text-xs font-bold text-slate-500 block mb-1">Yeni Klasör Oluştur</label>
                <div className="text-xs text-blue-500 mb-2">
                  {activeFolderId ? `"${folders.find(f => f.id === activeFolderId)?.title}" içine` : 'Ana Dizin'}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Klasör Adı" className="w-full border p-2 rounded text-sm" value={newFolderTitle} onChange={(e) => setNewFolderTitle(e.target.value)} />
                  <button className="bg-blue-600 text-white px-3 rounded hover:bg-blue-700">+</button>
                </div>
                {activeFolderId && (
                  <button type="button" onClick={() => setActiveFolderId(null)} className="text-xs text-red-500 mt-2 underline">Ana Dizine Dön</button>
                )}
              </form>

              {/* Folder List (Filtered by Parent) */}
              <ul className="space-y-2">
                {folders.filter(f => f.parentId === activeFolderId).length === 0 && <p className="text-xs text-slate-400 italic">Bu klasör boş.</p>}
                {folders.filter(f => f.parentId === activeFolderId).map(f => (
                  <li key={f.id}
                    onClick={() => handleSelectFolder(f.id)}
                    className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition ${activeFolderId === f.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    <span className="font-medium truncate flex-1"><i className={`fas ${activeFolderId === f.id ? 'fa-folder-open' : 'fa-folder'} mr-2`}></i>{f.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }} className="text-slate-400 hover:text-red-500 px-2"><i className="fas fa-trash-alt"></i></button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Main Content: Folder Details & Key Management */}
            <div className="lg:col-span-3 space-y-8">
              {activeFolderId ? (
                <>
                  {/* Folder Header */}
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                    <span onClick={() => setActiveFolderId(null)} className="cursor-pointer hover:underline">Ana Dizin</span>
                    <i className="fas fa-chevron-right text-xs"></i>
                    <span className="font-bold text-slate-800">{folders.find(f => f.id === activeFolderId)?.title}</span>
                  </div>

                  {/* Add Content Section */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">İçerik Ekle</h3>
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
                </>
              ) : (
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-blue-800 mb-8">
                  <p><i className="fas fa-info-circle mr-2"></i> Soldan bir klasör seçerek içine dosya yükleyebilirsiniz. Şifre yönetimi için aşağıya bakın.</p>
                </div>
              )}

              {/* GLOBAL KEY MANAGEMENT SECTION */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Şifre Yönetimi</h3>
                <p className="text-sm text-slate-500 mb-4">Buradan oluşturacağınız şifreler, seçeceğiniz klasörlere erişim sağlar.</p>

                <form onSubmit={handleCreateFolderKey} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {/* Left: Key Details */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Şifre</label>
                      <input type="text" className="w-full border p-2 rounded font-mono font-bold text-lg text-blue-600" value={newFolderKey} onChange={(e) => setNewFolderKey(e.target.value)} placeholder="Örn: 2025DERS" required />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Not / Öğrenci Adı</label>
                      <input type="text" className="w-full border p-2 rounded" value={newFolderKeyNote} onChange={(e) => setNewFolderKeyNote(e.target.value)} placeholder="Örn: Tüm Sınıf" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Geçerlilik Süresi (Opsiyonel)</label>
                      <input type="datetime-local" className="w-full border p-2 rounded text-sm" value={keyExpiresAt} onChange={(e) => setKeyExpiresAt(e.target.value)} />
                      <p className="text-xs text-slate-400 mt-1">Boş bırakılırsa süresiz olur.</p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" id="allowPrint" className="w-4 h-4 text-blue-600 rounded" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} />
                      <label htmlFor="allowPrint" className="text-sm font-bold text-slate-700 cursor-pointer">Yazdırma İzni Ver</label>
                    </div>
                  </div>

                  {/* Right: Folder Selection */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 block mb-2">Erişilebilecek Klasörler</label>
                    <div className="max-h-48 overflow-y-auto border rounded bg-white p-2 space-y-1">
                      {folders.map(f => (
                        <label key={f.id} className="flex items-center gap-2 p-1 hover:bg-slate-50 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selectedFolderIdsForKey.includes(f.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFolderIdsForKey(prev => [...prev, f.id]);
                              else setSelectedFolderIdsForKey(prev => prev.filter(id => id !== f.id));
                            }}
                            className="rounded text-blue-600"
                          />
                          <i className="fas fa-folder text-yellow-400"></i>
                          {f.title}
                        </label>
                      ))}
                      {folders.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Hiç klasör yok.</p>}
                    </div>

                    <label className="text-xs font-bold text-slate-500 block mb-2 mt-4">Erişilebilecek Özel Dosyalar</label>
                    <div className="max-h-48 overflow-y-auto border rounded bg-white p-2 space-y-1">
                      {allFiles.map(f => (
                        <label key={f.id} className="flex items-center gap-2 p-1 hover:bg-slate-50 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selectedFileIdsForKey.includes(f.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedFileIdsForKey(prev => [...prev, f.id]);
                              else setSelectedFileIdsForKey(prev => prev.filter(id => id !== f.id));
                            }}
                            className="rounded text-green-600"
                          />
                          <i className={`fas ${f.type === 'pdf' ? 'fa-file-pdf text-red-500' : 'fa-link text-blue-500'}`}></i>
                          {f.title}
                        </label>
                      ))}
                      {allFiles.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Hiç dosya yok.</p>}
                    </div>
                    <div className="mt-4">
                      <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 font-bold shadow-md shadow-blue-200">Şifre Oluştur</button>
                    </div>
                  </div>
                </form>

                {/* Keys List */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b"><th className="p-3">Şifre</th><th className="p-3">Kapsam</th><th className="p-3">Not</th><th className="p-3">Yazdır</th><th className="p-3">Bitiş</th><th className="p-3 text-right">Sil</th></tr>
                    </thead>
                    <tbody>
                      {folderKeys.map(k => (
                        <tr key={k.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-blue-600 text-lg">{k.keyCode}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {k.folderIds?.map(fid => {
                                const f = folders.find(fo => fo.id === fid);
                                return f ? <span key={fid} className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-200">{f.title}</span> : null;
                              })}
                              {(!k.folderIds || k.folderIds.length === 0) && <span className="text-xs text-red-400">Klasör Yok</span>}
                            </div>
                          </td>
                          <td className="p-3 text-slate-600">{k.note || '-'}</td>
                          <td className="p-3">
                            {k.allowPrint ? <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Evet</span> : <span className="text-xs bg-red-50 text-red-400 px-2 py-1 rounded">Hayır</span>}
                          </td>
                          <td className="p-3">
                            {k.expiresAt ? (
                              <span className={`text-xs font-bold px-2 py-1 rounded ${k.expiresAt < Date.now() ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {new Date(k.expiresAt).toLocaleString()}
                              </span>
                            ) : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Süresiz</span>}
                          </td>
                          <td className="p-3 text-right"><button onClick={() => handleDeleteFolderKey(k.id)} className="text-red-500 hover:bg-red-50 p-2 rounded transition"><i className="fas fa-trash"></i></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {adminTab === 'QUIZ' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-file-upload text-3xl"></i>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Sınav Yükleme Sihirbazı</h2>
            <p className="text-slate-500 mt-2">Word veya PDF dosyanızı yükleyin, soruları otomatik ayrıştıralım.</p>
          </div>

          <div className="max-w-xl mx-auto mb-8">
            <label className="block w-full cursor-pointer bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-indigo-50 hover:border-indigo-300 transition group">
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleFileUpload} />
              <i className="fas fa-cloud-upload-alt text-4xl text-slate-400 group-hover:text-indigo-500 mb-4 transition"></i>
              <p className="font-bold text-slate-700 group-hover:text-indigo-700">Dosya Seç veya Sürükle</p>
              <p className="text-xs text-slate-400 mt-1">PDF veya Word (.docx)</p>
            </label>
          </div>

          {isParsing && (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-bold animate-pulse">Yapay Zeka Soruları Okuyor...</p>
            </div>
          )}

          {!isParsing && parsedQuestions.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800"><span className="text-green-600">{parsedQuestions.length}</span> Soru Bulundu</h3>
                <button
                  onClick={handleSaveQuiz}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-lg shadow-green-200 transition"
                >
                  <i className="fas fa-save mr-2"></i>Hepsini Kaydet
                </button>
              </div>

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {parsedQuestions.map((q, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex gap-3">
                      <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 mb-3">{q.question_text}</p>
                        <div className="space-y-1 mb-3">
                          {q.options.map((opt, i) => (
                            <div key={i} className={`p-2 rounded text-sm ${opt.startsWith(q.correct_answer) ? 'bg-green-100 text-green-800 border border-green-200 font-bold' : 'bg-white border border-slate-100 text-slate-600'}`}>
                              {opt}
                            </div>
                          ))}
                        </div>
                        <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-800 border border-yellow-100">
                          <strong className="mr-1">Çözüm:</strong> {q.explanation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isParsing && quizFile && parsedQuestions.length === 0 && (
            <div className="text-center py-8 bg-red-50 rounded-xl border border-red-100 text-red-600">
              <i className="fas fa-exclamation-circle text-2xl mb-2"></i>
              <p className="font-bold">Soru Bulunamadı</p>
              <p className="text-sm mt-1">Lütfen dosya formatının "1. Soru... A) ... B) ..." şeklinde olduğundan emin olun.</p>
            </div>
          )}
        </div>
      )}
    </div >
  );
};
export default AdminDashboard;
