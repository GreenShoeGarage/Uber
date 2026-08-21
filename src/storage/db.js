const DB_NAME = 'ubertoothgui';
const DB_VERSION = 2;
const CAPTURE_STORE = 'captures';
const SURVEY_STORE = 'surveys';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CAPTURE_STORE)) db.createObjectStore(CAPTURE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SURVEY_STORE)) db.createObjectStore(SURVEY_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function withStore(storeName, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    try { result = fn(tx.objectStore(storeName)); }
    catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

async function getRecord(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function listRecords(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => { const rows=req.result.sort((a,b)=>(b.updatedAt??b.savedAt??0)-(a.updatedAt??a.savedAt??0)); db.close(); resolve(rows); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export class CaptureStore {
  async save(capture) {
    const record = { ...capture, id:capture.id??capture.session?.id??`capture-${Date.now()}`, name:capture.name??capture.session?.name??`Capture ${new Date().toLocaleString()}`, savedAt:Date.now() };
    await withStore(CAPTURE_STORE,'readwrite',store=>store.put(record)); return record.id;
  }
  async get(id){return getRecord(CAPTURE_STORE,id);} async list(){return listRecords(CAPTURE_STORE);} async remove(id){await withStore(CAPTURE_STORE,'readwrite',store=>store.delete(id));}
  async rename(id,name){const record=await this.get(id); if(!record) throw new Error('Capture not found.'); record.name=String(name||'').trim()||record.name; if(record.session) record.session.name=record.name; await this.save(record); return record;}
  async duplicate(id){const record=await this.get(id); if(!record) throw new Error('Capture not found.'); const copyId=`capture-${Date.now()}`; const copy=structuredClone(record); copy.id=copyId; copy.name=`${record.name??'Capture'} — Copy`; copy.savedAt=Date.now(); if(copy.session){copy.session.id=copyId;copy.session.name=copy.name;} await this.save(copy); return copyId;}
  async clear(){await withStore(CAPTURE_STORE,'readwrite',store=>store.clear());}
}

export class SurveyStore {
  async save(project){const record=structuredClone(project); record.updatedAt=Date.now(); await withStore(SURVEY_STORE,'readwrite',store=>store.put(record)); return record.id;}
  async get(id){return getRecord(SURVEY_STORE,id);} async list(){return listRecords(SURVEY_STORE);} async remove(id){await withStore(SURVEY_STORE,'readwrite',store=>store.delete(id));}
  async clear(){await withStore(SURVEY_STORE,'readwrite',store=>store.clear());}
}
