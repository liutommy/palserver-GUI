import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyAr-v78qAWwJEUnE7N6eh0x46f3wfJk36U',
  authDomain: 'palserver-gui.firebaseapp.com',
  projectId: 'palserver-gui',
  storageBucket: 'palserver-gui.appspot.com',
  messagingSenderId: '536539455986',
  appId: '1:536539455986:web:0254d9efb50cda1c148b6b',
  measurementId: 'G-H54819HQRF',
};

// Initialize Firebase
// (Analytics 已移除 — 不回傳使用統計;app 本身保留給版本檢查等唯讀功能)
const firebaseApp = initializeApp(firebaseConfig);

export default firebaseApp;
