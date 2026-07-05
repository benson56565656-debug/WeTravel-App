
import { createApp, ref, computed, watch, onMounted, nextTick, reactive } from 'https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js'

// Firebase 設定改由外部檔案提供：自架者請編輯 firebase-config.js
import { firebaseConfig } from './firebase-config.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, collection, doc, setDoc, onSnapshot, deleteDoc, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

createApp({
    setup() {
        console.log('Vue Setup started');
        const viewMode = ref('plan');
        const currentDayIdx = ref(0);
        const amountInputRef = ref(null);
        const isAmountInvalid = ref(false);
        const weatherInputRef = ref(null);

        const showTripMenu = ref(false);
        const tripList = ref([]);
        const currentTripId = ref(null);
        const showSetupModal = ref(false);
        const isEditing = ref(false);
        const isLocationsEditing = ref(false);
        const isDataLoading = ref(false);
        const isLoggedIn = ref(false);
        const dbError = ref(false);
        const dbErrorCode = ref('');
        const syncStatus = ref('synced');
        const shareUrl = ref('');
        const showShareModal = ref(false);
        const showJoinInput = ref(false);
        const joinTripUrl = ref('');

        const errorMap = {
            'not-configured': '尚未設定 Firebase：請編輯 firebase-config.js，填入你自己的 Firebase 專案設定（步驟見 README）。',
            'unavailable': '無法連線到伺服器，請檢查網路。',
            'permission-denied': '存取被拒絕，請確認您有權限。',
            'not-found': '找不到此行程，可能已被刪除。',
            'resource-exhausted': '配額已滿，請稍後再試。'
        };

        const dbErrorMessage = computed(() => errorMap[dbErrorCode.value] || `發生未知錯誤 (${dbErrorCode.value})`);

        let db = null;
        let auth = null;
        let unsubscribeTripData = null;
        let ignoreRemoteUpdate = false;

        const editingState = reactive({ dayTitle: false, flight: false, items: {} });

        const days = ref([]);
        const savedLocations = ref([]);
        const expenses = ref([]);
        const participants = ref(['班', '熊']);
        const participantsStr = ref('班, 熊');
        const exchangeRate = ref(0.215);
        const newExpense = ref({ item: '', amount: '', payer: '班' });

        const isRateLoading = ref(false);
        const weather = ref({ temp: null, icon: 'ph-sun', code: 0, location: '', daily: [] });
        const isWeatherEditing = ref(false);
        const setup = ref({ destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, rate: 1, currency: 'TWD', langCode: 'zh-TW', langName: '中文', mapProvider: 'google' });

        const currentDay = computed(() => days.value[currentDayIdx.value] || { items: [], flight: null, date: '', title: '' });
        const totalExpense = computed(() => expenses.value.reduce((sum, item) => sum + item.amount, 0));
        const paidByPerson = computed(() => {
            const map = {}; participants.value.forEach(p => map[p] = 0);
            expenses.value.forEach(e => { if (map[e.payer] === undefined) map[e.payer] = 0; map[e.payer] += e.amount; }); return map;
        });
        const currencyLabel = computed(() => setup.value.currency || '外幣');
        const currencySymbol = computed(() => { const map = { 'JPY': '¥', 'CNY': '¥', 'USD': '$', 'EUR': '€', 'KRW': '₩', 'GBP': '£', 'TWD': 'NT$', 'HKD': 'HK$', 'THB': '฿', 'VND': '₫' }; return map[setup.value.currency] || '$'; });
        const mapProviderLabel = computed(() => { const map = { 'google': 'Google Maps', 'naver': 'Naver Map', 'amap': '高德地圖' }; return map[setup.value.mapProvider] || '地圖'; });

        const weatherDisplay = computed(() => {
            if (!weather.value) return { temp: '--', icon: 'ph-sun', label: '載入中...', isForecast: false };
            const loc = weather.value.location || (setup.value ? setup.value.destination : '') || '當地';
            if (!currentDay.value || !currentDay.value.fullDate || !weather.value.daily || weather.value.daily.length === 0) {
                return { temp: weather.value.temp !== null ? `${weather.value.temp}°` : '--', icon: weather.value.icon || 'ph-sun', label: loc, isForecast: false };
            }
            const targetDate = currentDay.value.fullDate;
            if (weather.value.daily.time) {
                const idx = weather.value.daily.time.indexOf(targetDate);
                if (idx !== -1) {
                    const max = Math.round(weather.value.daily.temperature_2m_max[idx]);
                    const min = Math.round(weather.value.daily.temperature_2m_min[idx]);
                    return { temp: `${min}°-${max}°`, icon: getWeatherIcon(weather.value.daily.weathercode[idx]), label: loc, isForecast: true };
                }
            }
            return { temp: weather.value.temp !== null ? `${weather.value.temp}°` : '--', icon: weather.value.icon || 'ph-sun', label: loc, isForecast: false };
        });

        const generateId = () => 'item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const getWeatherIcon = (c) => { if (c === 0) return 'ph-sun'; if (c < 4) return 'ph-cloud-sun'; if (c < 50) return 'ph-cloud-fog'; if (c < 70) return 'ph-cloud-rain'; return 'ph-cloud'; };
        const getTimePeriod = (t) => { if (!t) return '時間'; const h = parseInt(t.split(':')[0]); return h < 5 ? '凌晨' : h < 11 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : '晚上'; };

        const toggleFlightCard = () => { if (currentDay.value.flight) { } else { currentDay.value.flight = { type: 'arrival', startTime: '10:00', startAirport: 'TPE', number: '', endTime: '14:00', endAirport: 'DEST', arrivalOffset: 0 }; editingState.flight = true; } };
        const removeFlight = () => { if (confirm('確定移除此航班資訊?')) { if (days.value[currentDayIdx.value]) { days.value[currentDayIdx.value].flight = null; } editingState.flight = false; } };
        const getDotColor = (t) => { if (t === 'food') return 'bg-orange-400 border-orange-100 ring-2 ring-orange-50'; if (t === 'shop') return 'bg-pink-400 border-pink-100 ring-2 ring-pink-50'; if (t === 'transport' || t === 'flight') return 'bg-blue-500 border-blue-100 ring-2 ring-blue-50'; return 'bg-primary-500 border-primary-100 ring-2 ring-primary-50'; };
        const updateParticipants = () => { participants.value = participantsStr.value.split(',').map(s => s.trim()).filter(s => s); };
        const updateDate = (e, day) => { const val = e.target.value; if (!val) return; day.fullDate = val; const [y, m, d] = val.split('-').map(Number); const dt = new Date(y, m - 1, d); const w = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]; day.date = `${m < 10 ? '0' + m : m}/${d < 10 ? '0' + d : d} (${w})`; day.shortDate = `${m}/${d}`; };
        const isUrl = (str) => { if (!str) return false; try { new URL(str); return true; } catch { return /^https?:\/\//i.test(str); } };

        const addItem = () => {
            const newItem = { id: generateId(), time: '', type: 'spot', activity: '', location: '', link: '', note: '' };
            currentDay.value.items.push(newItem);
            editingState.items[newItem.id] = true;
        };
        const removeItem = (item) => {
            if (confirm('確定刪除此行程?')) {
                const idx = currentDay.value.items.findIndex(i => i.id === item.id);
                if (idx !== -1) {
                    currentDay.value.items.splice(idx, 1);
                    delete editingState.items[item.id];
                }
            }
        };
        const toggleEditItem = (item) => {
            if (editingState.items[item.id]) {
                // 使用明確賦值而非 delete，確保 Vue reactive 能偵測變更
                editingState.items[item.id] = false;
                // 依時間排序（00:00-23:59 由上到下），無時間的排到最後
                if (currentDay.value && currentDay.value.items) {
                    currentDay.value.items.sort((a, b) => {
                        if (!a.time && !b.time) return 0;
                        if (!a.time) return 1;
                        if (!b.time) return -1;
                        return a.time.localeCompare(b.time);
                    });
                }
                // 同時觸發儲存
                nextTick(() => debouncedSave());
            } else {
                editingState.items[item.id] = true;
            }
        };
        const isEditingItem = (item) => !!editingState.items[item.id];
        const addDay = () => days.value.push({ date: `Day ${days.value.length + 1}`, title: '', items: [] });
        const addSavedLocation = () => { savedLocations.value.push({ id: generateId(), name: '', link: '', note: '' }); };
        const removeSavedLocation = (idx) => { if (confirm('確定移除此地點?')) savedLocations.value.splice(idx, 1); };
        const addExpense = () => { if (!newExpense.value.item) { alert('請輸入消費項目'); return; } if (!newExpense.value.amount) { isAmountInvalid.value = true; nextTick(() => { amountInputRef.value?.focus(); }); return; } expenses.value.unshift({ ...newExpense.value }); newExpense.value.item = ''; newExpense.value.amount = ''; isAmountInvalid.value = false; };
        const removeExpense = (idx) => expenses.value.splice(idx, 1);

        const getExternalMapLink = (loc) => { if (!loc) return '#'; if (isUrl(loc)) return loc; const encodedLoc = encodeURIComponent(loc); if (setup.value.mapProvider === 'naver') return `https://map.naver.com/v5/search/${encodedLoc}`; else if (setup.value.mapProvider === 'amap') return `https://www.amap.com/search?query=${encodedLoc}`; else return `https://www.google.com/maps/search/?api=1&query=${encodedLoc}`; };
        const countryInfoMap = { 'jp': { c: 'JPY', l: 'ja', n: '日文', m: 'google' }, 'kr': { c: 'KRW', l: 'ko', n: '韓文', m: 'naver' }, 'us': { c: 'USD', l: 'en', n: '英文', m: 'google' }, 'cn': { c: 'CNY', l: 'zh-CN', n: '簡中', m: 'amap' }, 'th': { c: 'THB', l: 'th', n: '泰文', m: 'google' }, 'tw': { c: 'TWD', l: 'zh-TW', n: '中文', m: 'google' } };
        const updateRateByCurrency = async () => { const currency = setup.value.currency; if (!currency) return; isRateLoading.value = true; try { if (currency === 'TWD') { setup.value.rate = 1; } else { const rRes = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`); const rData = await rRes.json(); if (rData?.rates?.TWD) setup.value.rate = rData.rates.TWD; } } catch (e) { console.error('Fetch rate failed', e); } finally { isRateLoading.value = false; } };
        const detectRate = async () => { if (!setup.value.destination) return; isRateLoading.value = true; try { const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(setup.value.destination)}&limit=1&addressdetails=1`); const geoData = await geoRes.json(); if (geoData?.[0]?.address?.country_code) { const code = geoData[0].address.country_code.toLowerCase(); const info = countryInfoMap[code] || { c: 'USD', l: 'en', n: '英文', m: 'google' }; setup.value.currency = info.c; setup.value.langCode = info.l; setup.value.langName = info.n; setup.value.mapProvider = info.m || 'google'; if (!weather.value.location) weather.value.location = setup.value.destination; if (info.c === 'TWD') setup.value.rate = 1; else { const rRes = await fetch(`https://api.exchangerate-api.com/v4/latest/${info.c}`); const rData = await rRes.json(); if (rData?.rates?.TWD) setup.value.rate = rData.rates.TWD; } } } catch (e) { } finally { isRateLoading.value = false; } };
        const toggleWeatherEdit = () => { isWeatherEditing.value = !isWeatherEditing.value; if (isWeatherEditing.value) { nextTick(() => weatherInputRef.value?.focus()); } };
        const updateWeatherLocation = () => { isWeatherEditing.value = false; if (weather.value.location) { fetchWeather(weather.value.location); } };
        const fetchWeather = async (locName) => { try { weather.value.location = locName; const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locName)}&limit=1`); const geoData = await geoRes.json(); if (geoData?.[0]) { const { lat, lon } = geoData[0]; const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=16`); const wData = await wRes.json(); weather.value.temp = Math.round(wData.current_weather.temperature); weather.value.icon = getWeatherIcon(wData.current_weather.weathercode); if (wData.daily) weather.value.daily = wData.daily; } } catch (e) { weather.value.temp = '--'; } };
        const initSortable = () => { const el = document.getElementById('saved-locations-list'); if (el) { Sortable.create(el, { animation: 150, delay: 200, delayOnTouchOnly: true, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag', onEnd: (evt) => { const item = savedLocations.value.splice(evt.oldIndex, 1)[0]; savedLocations.value.splice(evt.newIndex, 0, item); } }); } };

        const loadTripList = () => {
            const list = localStorage.getItem('travel_app_index');
            tripList.value = list ? JSON.parse(list) : [];
        };

        const saveTripList = async () => {
            localStorage.setItem('travel_app_index', JSON.stringify(tripList.value));
        };

        const createNewTrip = () => {
            ignoreRemoteUpdate = true; // Prevent saving these resets to the current trip
            if (timeout) { clearTimeout(timeout); timeout = null; } // 取消舊旅程待存檔
            isEditing.value = false;
            showSetupModal.value = true;
            showTripMenu.value = false;
            setup.value = { destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, rate: 1, currency: 'TWD', langCode: 'zh-TW', langName: '中文', mapProvider: 'google' };
            weather.value.location = '';
            participantsStr.value = '班, 熊';
            participants.value = ['班', '熊'];
            isRateLoading.value = false;
            nextTick(() => ignoreRemoteUpdate = false);
        };

        const joinTrip = () => {
            const input = joinTripUrl.value.trim();
            if (!input) { alert('請貼上行程連結或 ID'); return; }
            // 從 URL 中提取 tripId，或直接使用輸入值作為 ID
            let tripId = input;
            try {
                const url = new URL(input);
                const params = new URLSearchParams(url.search);
                if (params.has('tripId')) tripId = params.get('tripId');
            } catch (e) {
                // 不是 URL 格式，直接當作 tripId 使用
            }
            if (!tripId) { alert('無法解析行程 ID'); return; }
            // 檢查是否已存在
            if (tripList.value.find(t => t.id === tripId)) {
                switchTrip(tripId);
                showJoinInput.value = false;
                joinTripUrl.value = '';
                return;
            }
            // 加入行程列表
            tripList.value.unshift({ id: tripId, destination: '載入中...', startDate: '...', daysCount: 0 });
            saveTripList();
            switchTrip(tripId);
            showJoinInput.value = false;
            joinTripUrl.value = '';
        };

        let setupSnapshot = null;

        const openEditModal = () => {
            const currentTrip = tripList.value.find(t => t.id === currentTripId.value);
            if (currentTrip) setup.value.destination = currentTrip.destination;
            setup.value.days = days.value.length;
            if (days.value.length > 0 && days.value[0].fullDate) setup.value.startDate = days.value[0].fullDate;
            setupSnapshot = JSON.parse(JSON.stringify(setup.value));
            isRateLoading.value = false;
            isEditing.value = true; showSetupModal.value = true;
        };

        const cancelSetupModal = () => {
            if (isEditing.value && setupSnapshot) {
                ignoreRemoteUpdate = true;
                setup.value = JSON.parse(JSON.stringify(setupSnapshot));
                nextTick(() => ignoreRemoteUpdate = false);
            }
            setupSnapshot = null;
            showSetupModal.value = false;
        };

        const initTrip = () => {
            if (!setup.value.destination) { alert('請輸入目的地'); return; }

            if (isEditing.value && currentTripId.value) {
                if (setup.value.destination) {
                    if (weather.value && setup.value.destination !== weather.value.location) {
                        weather.value.location = setup.value.destination;
                        fetchWeather(weather.value.location);
                    }
                }
                exchangeRate.value = setup.value.rate;

                const trip = tripList.value.find(t => t.id === currentTripId.value);
                if (trip) {
                    trip.destination = setup.value.destination;
                    trip.daysCount = setup.value.days;
                    trip.startDate = setup.value.startDate;
                    saveTripList();
                }

                const [y, m, d] = setup.value.startDate.split('-').map(Number);
                const start = new Date(y, m - 1, d);
                const dNames = ['日', '一', '二', '三', '四', '五', '六'];
                const newDaysCount = setup.value.days;

                if (newDaysCount > days.value.length) {
                    const addCount = newDaysCount - days.value.length;
                    for (let i = 0; i < addCount; i++) { days.value.push({ items: [], flight: null, title: '自由活動' }); }
                } else if (newDaysCount < days.value.length) {
                    if (confirm('天數減少，多出的行程將被刪除，確定嗎？')) { days.value.splice(newDaysCount); }
                    else { setup.value.days = days.value.length; }
                }

                days.value.forEach((day, i) => {
                    const curr = new Date(start); curr.setDate(start.getDate() + i);
                    const mm = curr.getMonth() + 1; const dd = curr.getDate(); const yyyy = curr.getFullYear();
                    const fullDate = `${yyyy}-${mm < 10 ? '0' + mm : mm}-${dd < 10 ? '0' + dd : dd}`;
                    day.date = `${mm < 10 ? '0' + mm : mm}/${dd < 10 ? '0' + dd : dd} (${dNames[curr.getDay()]})`;
                    day.shortDate = `${mm}/${dd}`;
                    day.fullDate = fullDate;
                    if (!day.title) day.title = '行程規劃';
                });

                showSetupModal.value = false;
                return;
            }

            if (weather.value && !weather.value.location) weather.value.location = setup.value.destination;
            if (weather.value && weather.value.location) fetchWeather(weather.value.location);

            const newId = generateId();
            const newTripMeta = { id: newId, destination: setup.value.destination, startDate: setup.value.startDate, daysCount: setup.value.days };
            const newDays = [];
            const [ny, nm, nd] = setup.value.startDate.split('-').map(Number);
            const start = new Date(ny, nm - 1, nd);
            const dNames = ['日', '一', '二', '三', '四', '五', '六'];
            for (let i = 0; i < setup.value.days; i++) {
                const curr = new Date(start); curr.setDate(start.getDate() + i);
                const mm = curr.getMonth() + 1; const dd = curr.getDate(); const yyyy = curr.getFullYear();
                const fullDate = `${yyyy}-${mm < 10 ? '0' + mm : mm}-${dd < 10 ? '0' + dd : dd}`;
                newDays.push({
                    date: `${mm < 10 ? '0' + mm : mm}/${dd < 10 ? '0' + dd : dd} (${dNames[curr.getDay()]})`,
                    shortDate: `${mm}/${dd}`,
                    fullDate: fullDate,
                    title: i === 0 ? '抵達 & 探索' : '行程規劃',
                    items: [], flight: null
                });
            }

            // 防止舊旅程資料被存入新旅程
            ignoreRemoteUpdate = true;
            // 取消舊旅程的待存檔計時器
            if (timeout) { clearTimeout(timeout); timeout = null; }

            // 先設定新旅程資料，再切換 ID
            days.value = newDays;
            expenses.value = [];
            savedLocations.value = [];
            exchangeRate.value = setup.value.rate;
            participantsStr.value = '班, 熊';
            participants.value = ['班', '熊'];

            tripList.value.unshift(newTripMeta);
            saveTripList();

            switchTrip(newId);

            showSetupModal.value = false;
            viewMode.value = 'plan';

            // 等 onSnapshot 初始化完成後，解除鎖定並將新旅程資料存入 Firestore
            nextTick(() => {
                ignoreRemoteUpdate = false;
                debouncedSave();
            });
        };

        const deleteTrip = async (id) => {
            if (!confirm('確定刪除此行程？無法復原。')) return;
            // 1. Remove from local list
            tripList.value = tripList.value.filter(t => t.id !== id);
            saveTripList();

            // 2. Remove from Firestore
            if (db) {
                try {
                    await deleteDoc(doc(db, 'trips', id));
                } catch (e) {
                    console.error("Delete failed", e);
                }
            }

            // 3. Handle UI switch
            if (currentTripId.value === id) {
                if (tripList.value.length > 0) {
                    switchTrip(tripList.value[0].id);
                } else {
                    days.value = [];
                    currentTripId.value = null;
                    showSetupModal.value = true;
                }
            }
        };

        const shareTrip = async () => {
            if (!currentTripId.value) return;
            const url = new URL(window.location.href);
            url.searchParams.set('tripId', currentTripId.value);
            const shareData = {
                title: `WeTravel: ${setup.value.destination}`,
                text: `一起來規劃 ${setup.value.destination} 的行程吧！`,
                url: url.toString()
            };

            if (navigator.share) {
                try { await navigator.share(shareData); } catch (e) { }
            } else {
                try {
                    await navigator.clipboard.writeText(url.toString());
                    alert('連結已複製！傳送給朋友即可共同編輯。');
                } catch (e) {
                    prompt('請複製以下連結分享：', url.toString());
                }
            }
        };

        const switchTrip = async (id) => {
            currentTripId.value = id;
            viewMode.value = 'plan'; // Reset view to plan
            showTripMenu.value = false;
            window.scrollTo(0, 0);

            if (!db) return;

            if (unsubscribeTripData) { unsubscribeTripData(); unsubscribeTripData = null; }

            isDataLoading.value = true;
            currentDayIdx.value = 0; // Reset only on initial trip switch
            // Listen to 'trips' collection directly
            unsubscribeTripData = onSnapshot(doc(db, 'trips', id), (docSnap) => {
                isDataLoading.value = false;
                dbError.value = false;
                if (docSnap.exists()) {
                    if (timeout) clearTimeout(timeout); // Clear any pending local saves
                    ignoreRemoteUpdate = true;
                    const data = docSnap.data();

                    // Ensure all items have IDs (Migration for old data)
                    if (data.days) {
                        data.days.forEach(day => {
                            if (day.items) {
                                day.items = day.items.filter(i => i); // Filter nulls
                                day.items.forEach(item => {
                                    if (!item.id) item.id = generateId();
                                });
                            }
                        });
                    }

                    days.value = data.days || [];
                    expenses.value = data.expenses || [];
                    savedLocations.value = (data.locations || []).filter(l => l);

                    // Prevent setup leakage from previous trip
                    const defaultSetup = { destination: '', startDate: new Date().toISOString().split('T')[0], days: 5, rate: 1, currency: 'TWD', langCode: 'zh-TW', langName: '中文', mapProvider: 'google' };
                    setup.value = data.setup || defaultSetup;

                    if (data.rate) exchangeRate.value = data.rate;
                    if (data.users) {
                        participantsStr.value = data.users;
                    } else {
                        participantsStr.value = '班, 熊'; // Default for old data
                    }
                    updateParticipants();

                    if (data.weather_loc) {
                        if (weather.value) weather.value.location = data.weather_loc;
                        fetchWeather(data.weather_loc);
                    } else if (setup.value.destination) {
                        if (weather.value) weather.value.location = setup.value.destination;
                        if (weather.value && weather.value.location) fetchWeather(weather.value.location);
                    }

                    // Update local trip list metadata
                    const currentMeta = tripList.value.find(t => t.id === currentTripId.value);
                    if (currentMeta) {
                        let changed = false;
                        if (currentMeta.destination !== setup.value.destination) { currentMeta.destination = setup.value.destination; changed = true; }
                        if (currentMeta.startDate !== setup.value.startDate) { currentMeta.startDate = setup.value.startDate; changed = true; }
                        if (currentMeta.daysCount !== setup.value.days) { currentMeta.daysCount = setup.value.days; changed = true; }
                        if (changed) saveTripList();
                    }

                    nextTick(() => ignoreRemoteUpdate = false);
                } else {
                    isDataLoading.value = false;
                }
            }, (error) => {
                console.error("Snapshot error:", error);
                isDataLoading.value = false;
                if (error.code === 'not-found' || error.message.includes('database')) {
                    dbError.value = true;
                    dbErrorCode.value = error.code;
                }
                syncStatus.value = 'offline';
            });

            try { const url = new URL(window.location); url.searchParams.set('tripId', id); window.history.pushState({}, '', url); } catch (e) { }
        };

        let timeout = null;
        const debouncedSave = () => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(async () => {
                if (!db || !currentTripId.value || ignoreRemoteUpdate) return;
                syncStatus.value = 'syncing';
                try {
                    const dataToSave = {
                        days: JSON.parse(JSON.stringify(days.value)),
                        expenses: expenses.value,
                        locations: savedLocations.value,
                        rate: exchangeRate.value,
                        users: participantsStr.value,
                        setup: setup.value,
                        weather_loc: weather.value.location,
                        lastUpdated: new Date().toISOString()
                    };
                    await setDoc(doc(db, 'trips', currentTripId.value), dataToSave, { merge: true });
                    dbError.value = false;
                    syncStatus.value = 'synced';
                } catch (e) {
                    console.error("Save error", e);
                    if (e.code === 'not-found' || e.message.includes('database')) {
                        dbError.value = true;
                        dbErrorCode.value = e.code;
                    }
                }
            }, 1000);
        };

        watch([days, expenses, savedLocations, exchangeRate, participantsStr, setup], () => {
            if (!ignoreRemoteUpdate && !(showSetupModal.value && !isEditing.value)) debouncedSave();
        }, { deep: true });

        watch(() => weather.value.location, () => {
            if (!ignoreRemoteUpdate && !(showSetupModal.value && !isEditing.value)) debouncedSave();
        });

        const initAuth = async () => {
            try {
                await signInAnonymously(auth);
            } catch (e) { console.error("Auth failed", e); }
            finally {
                isLoggedIn.value = true;
            }
        };

        const retryConnection = () => {
            window.location.reload();
        };

        onMounted(() => {
            // 未填入自己的 Firebase 設定時，顯示設定指引，不初始化
            if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith('YOUR_')) {
                dbError.value = true;
                dbErrorCode.value = 'not-configured';
                return;
            }
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);

            // Modern Firestore initialization with multi-tab persistence support
            try {
                db = initializeFirestore(app, {
                    localCache: persistentLocalCache({
                        tabManager: persistentMultipleTabManager()
                    })
                });
            } catch (e) {
                console.warn('Firestore init error (likely persistent cache fallback):', e);
                // Fallback for browsers that might strictly fail custom init (though 10.7.1 should be fine)
                // If this fails, it usually falls back to default memory cache automatically.
            }

            initAuth();

            onAuthStateChanged(auth, (user) => {
                isLoggedIn.value = !!user;
                loadTripList();

                const urlParams = new URLSearchParams(window.location.search);
                const sharedTripId = urlParams.get('tripId');

                if (sharedTripId) {
                    if (!tripList.value.find(t => t.id === sharedTripId)) {
                        tripList.value.unshift({ id: sharedTripId, destination: '載入中...', startDate: '...', daysCount: 0 });
                        saveTripList();
                    }
                    switchTrip(sharedTripId);
                } else {
                    if (tripList.value.length > 0) {
                        switchTrip(tripList.value[0].id);
                    } else {
                        showSetupModal.value = true;
                    }
                }
            });

            watch(viewMode, (newVal) => { if (newVal === 'locations') { nextTick(() => initSortable()); } });
        });

        return {
            viewMode, currentDayIdx, days, currentDay, participants, participantsStr, updateParticipants,
            getExternalMapLink, addItem, removeItem, removeFlight, addDay,
            expenses, newExpense, totalExpense, addExpense, removeExpense,
            paidByPerson, exchangeRate,
            weather, getTimePeriod,
            updateDate, showSetupModal, setup, initTrip, weatherDisplay, detectRate, isRateLoading, currencyLabel, currencySymbol, toggleFlightCard, getDotColor,
            showTripMenu, tripList, createNewTrip, switchTrip, deleteTrip, currentTripId,
            openEditModal, cancelSetupModal, isEditing, mapProviderLabel, amountInputRef, isAmountInvalid, isUrl,
            editingState, toggleEditItem, isEditingItem,
            savedLocations, addSavedLocation, removeSavedLocation,
            updateRateByCurrency,
            toggleWeatherEdit, isWeatherEditing, updateWeatherLocation, weatherInputRef,
            isLocationsEditing, loadTripList,
            isDataLoading, isLoggedIn, dbError, dbErrorCode, dbErrorMessage, retryConnection, syncStatus,
            shareTrip, showShareModal,
            showJoinInput, joinTripUrl, joinTrip
        };
    }
}).mount('#app')
