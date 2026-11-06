/**
 * Wishlist – Google Apps Script web app
 * ข้อมูลเก็บใน Google Sheet (แท็บ "Wishlist") / รูปที่อัปโหลดเก็บใน Drive โฟลเดอร์ "Wishlist Images"
 */

const SPREADSHEET_ID = '1Ayz7Nems696OvDZ4VklKUm8F3wHuBiMoyVQT-a2iUlk';
const SHEET_NAME = 'Wishlist';
const FOLDER_NAME = 'Wishlist Images';
const HEADERS = ['id', 'name', 'image', 'links', 'status', 'price', 'note', 'createdAt', 'updatedAt'];
const STATUSES = ['planning', 'preorder', 'bought'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('My Wishlist')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Sheet helpers ---------- */

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function rowToItem_(r) {
  let links = [];
  try { links = JSON.parse(r[3] || '[]'); } catch (e) { links = []; }
  return {
    id: String(r[0]),
    name: String(r[1] || ''),
    image: String(r[2] || ''),
    links: Array.isArray(links) ? links : [],
    status: STATUSES.indexOf(String(r[4])) >= 0 ? String(r[4]) : 'planning',
    price: String(r[5] || ''),
    note: String(r[6] || ''),
    createdAt: Number(r[7]) || 0,
    updatedAt: Number(r[8]) || 0
  };
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

/* ---------- API (called from Index.html) ---------- */

function getItems() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(r => r[0] !== '')
    .map(rowToItem_);
}

function saveItem(item) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_();
    const now = Date.now();
    const links = (item.links || [])
      .filter(l => l && l.url)
      .map(l => ({ label: String(l.label || ''), url: String(l.url), note: String(l.note || '') }));
    const clean = {
      id: item.id || Utilities.getUuid(),
      name: String(item.name || '').trim(),
      image: String(item.image || '').trim(),
      links: JSON.stringify(links),
      status: STATUSES.indexOf(item.status) >= 0 ? item.status : 'planning',
      price: String(item.price || ''),
      note: String(item.note || ''),
      createdAt: Number(item.createdAt) || now,
      updatedAt: now
    };
    if (!clean.name) throw new Error('กรุณาใส่ชื่อของ');
    const row = HEADERS.map(h => clean[h]);
    const r = findRow_(sh, clean.id);
    if (r) sh.getRange(r, 1, 1, HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return rowToItem_(row);
  } finally {
    lock.releaseLock();
  }
}

function setStatus(id, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Invalid status');
  const sh = getSheet_();
  const r = findRow_(sh, id);
  if (!r) throw new Error('ไม่พบรายการนี้');
  sh.getRange(r, 5).setValue(status);
  sh.getRange(r, 9).setValue(Date.now());
  return rowToItem_(sh.getRange(r, 1, 1, HEADERS.length).getValues()[0]);
}

function deleteItem(id) {
  const sh = getSheet_();
  const r = findRow_(sh, id);
  if (r) sh.deleteRow(r);
  return true;
}

/* ---------- Image upload to Drive ---------- */

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) { /* recreate below */ }
  }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function uploadImage(dataUrl, filename) {
  const s = String(dataUrl);
  const comma = s.indexOf(',');
  if (s.indexOf('data:') !== 0 || comma < 0) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  const mime = s.substring(5, s.indexOf(';'));
  const blob = Utilities.newBlob(Utilities.base64Decode(s.substring(comma + 1)), mime,
    filename || ('wishlist_' + Date.now()));
  const file = getFolder_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) { /* บางบัญชีตั้งค่าแชร์ไม่ได้ – รูปยังแสดงได้สำหรับเจ้าของ */ }
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}
