const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const nowEl = $("nowPlaying");
const favEl = $("favorites");
const recEl = $("recents");
const audio = $("player");
audio.crossOrigin = "anonymous";

let scene, camera, renderer, controls;
let globe, clouds, atmosphere;
let markers = [];
let currentMarker = null;

let nightMode = false;
let textures = {};

const RADIUS = 5.0;

function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function getFavorites() { return readLS("favorites", []); }
function getRecents() { return readLS("recents", []); }
function getAllStations() { return readLS("cachedStations", []); }

function stationKey(st) { return (st.stationuuid || "") + "|" + (st.stream || ""); }

function minifyStation(st) {
  return {
    name: st.name || "",
    stream: st.stream || "",
    country: st.country || "",
    favicon: st.favicon || ""
  };
}

function pushToNative() {
  try {
    if (window.AndroidBridge) {
      window.AndroidBridge.saveAllStations(JSON.stringify(getAllStations().map(minifyStation)));
      window.AndroidBridge.saveFavorites(JSON.stringify(getFavorites().map(minifyStation)));
      window.AndroidBridge.saveRecents(JSON.stringify(getRecents().map(minifyStation)));
    }
  } catch (e) {}
}

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  $("globe").appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.7;

  const light = new THREE.PointLight(0xffffff, 1.2);
  light.position.set(12, 8, 10);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x2a2a2a);
  scene.add(ambient);

  const loader = new THREE.TextureLoader();
  textures.day = loader.load("https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg");
  textures.night = loader.load("https://threejs.org/examples/textures/planets/earth_at_night_2048.jpg");
  textures.clouds = loader.load("https://threejs.org/examples/textures/planets/earth_clouds_1024.png");

  globe = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 64, 64),
    new THREE.MeshPhongMaterial({ map: textures.day })
  );
  scene.add(globe);

  clouds = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + 0.05, 64, 64),
    new THREE.MeshPhongMaterial({ map: textures.clouds, transparent: true, opacity: 0.4 })
  );
  scene.add(clouds);

  atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + 0.35, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x3399ff, transparent: true, opacity: 0.14, side: THREE.BackSide })
  );
  scene.add(atmosphere);

  window.addEventListener("resize", onResize);
  onResize();

  renderer.domElement.addEventListener("pointerup", onClick);
  renderer.domElement.addEventListener("dblclick", onDoubleClick);
let pressTimer = null;
renderer.domElement.addEventListener("pointerdown", (ev) => {
  pressTimer = setTimeout(() => {
    const m = pickMarker(ev);
    if (m) toggleFavorite(m.userData);
  }, 450); // long press = favorite
});
renderer.domElement.addEventListener("pointerup", () => {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
});
renderer.domElement.addEventListener("pointermove", () => {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
});
  animate();
}

function onResize() {
  const w = $("globeWrap").clientWidth;
  const h = $("globeWrap").clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function clearMarkers() {
  markers.forEach(m => scene.remove(m));
  markers = [];
  currentMarker = null;
}

function buildMarkers(stations) {
  clearMarkers();
  const MAX = 1200;
  const subset = stations.slice(0, Math.min(MAX, stations.length));

  subset.forEach((st, i) => {
    const pos = latLngToVector3(st.lat, st.lng, RADIUS + 0.12);
    const mat = new THREE.SpriteMaterial({ color: 0xff00aa, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(0.30, 0.30, 0.30);
    s.userData = st;
    scene.add(s);
    markers.push(s);
  });

  statusEl.textContent = `Markers: ${markers.length} (from ${stations.length} stations)`;
}

function highlightMarker(marker) {
  if (currentMarker) currentMarker.material.color.set(0xff00aa);
  marker.material.color.set(0x00ffcc);
  currentMarker = marker;
}

const raycaster = new THREE.Raycaster();
// Make Sprite markers easier to tap (especially on mobile)
raycaster.params.Sprite.threshold = 0.35;
const mouse = new THREE.Vector2();

function setMouseFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
}

function pickMarker(ev) {
  setMouseFromEvent(ev);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(markers);
  return hits.length ? hits[0].object : null;
}

function focusOn(marker) {
  const target = marker.position.clone().normalize().multiplyScalar(10);
  new TWEEN.Tween(camera.position)
    .to({ x: target.x, y: target.y, z: target.z }, 900)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
}

function playStation(st) {
  if (!st?.stream) return;
  audio.src = st.stream;
  audio.play().catch(()=>{});
  nowEl.textContent = `${st.name || "Station"}${st.country ? " · " + st.country : ""}`;
}

function saveRecent(st) {
  const rec = getRecents();
  const k = stationKey(st);
  const next = [st, ...rec.filter(x => stationKey(x) !== k)].slice(0, 15);
  writeLS("recents", next);
  pushToNative();
  renderPanels();
}

function toggleFavorite(st) {
  const fav = getFavorites();
  const k = stationKey(st);
  const exists = fav.some(x => stationKey(x) === k);
  const next = exists ? fav.filter(x => stationKey(x) !== k) : [st, ...fav];
  writeLS("favorites", next);
  pushToNative();
  renderPanels();
}

function onClick(ev) {
  const m = pickMarker(ev);
  if (!m) return;
  const st = m.userData;
  highlightMarker(m);
  focusOn(m);
  playStation(st);
  saveRecent(st);
}

function onDoubleClick(ev) {
  const m = pickMarker(ev);
  if (!m) return;
  toggleFavorite(m.userData);
}

function makeStationButton(st, prefix = "") {
  const btn = document.createElement("button");
  btn.className = "cardbtn";
  btn.innerHTML = `<div class="t">${escapeHtml(prefix + (st.name || "Station"))}</div>
                   <div class="s">${escapeHtml(st.country || "")}</div>`;
  btn.onclick = () => { playStation(st); saveRecent(st); };
  return btn;
}

function renderPanels() {
  favEl.innerHTML = "";
  recEl.innerHTML = "";

  const fav = getFavorites();
  const rec = getRecents();

  if (!fav.length) {
    const d = document.createElement("div");
    d.style.color = "#9fb0d0";
    d.textContent = "Double-tap a marker to add favorites.";
    favEl.appendChild(d);
  } else {
    fav.forEach(st => favEl.appendChild(makeStationButton(st, "★ ")));
  }

  if (!rec.length) {
    const d = document.createElement("div");
    d.style.color = "#9fb0d0";
    d.textContent = "Tap a marker to start your history.";
    recEl.appendChild(d);
  } else {
    rec.forEach(st => recEl.appendChild(makeStationButton(st, "⟲ ")));
  }
}

async function fetchStationsFromAPI() {
  const url = "https://de1.api.radio-browser.info/json/stations/topclick/800";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("API fetch failed");
  const raw = await res.json();

  return raw.map(s => ({
    stationuuid: s.stationuuid,
    name: s.name,
    country: s.country,
    favicon: s.favicon,
    tags: s.tags,
    stream: s.url_resolved || s.url,
    lat: parseFloat(s.geo_lat),
    lng: parseFloat(s.geo_long)
  })).filter(s =>
    Number.isFinite(s.lat) && Number.isFinite(s.lng) &&
    s.stream && typeof s.stream === "string" && s.stream.startsWith("http")
  );
}

function applyFilters() {
  const q = ($("search").value || "").trim().toLowerCase();
  const g = ($("genre").value || "").trim().toLowerCase();

  const all = getAllStations();
  const filtered = all.filter(s => {
    const hitQ = !q || (s.name || "").toLowerCase().includes(q) || (s.country || "").toLowerCase().includes(q);
    const hitG = !g || ((s.tags || "").toLowerCase().includes(g));
    return hitQ && hitG;
  });

  buildMarkers(filtered);
}

async function loadStations({ force = false } = {}) {
  statusEl.textContent = "Loading stations…";
  const cached = getAllStations();

  if (cached.length && !force) {
    buildMarkers(cached);
    statusEl.textContent = `Loaded cached stations: ${cached.length}`;
  }

  try {
    const fresh = await fetchStationsFromAPI();
    writeLS("cachedStations", fresh);
    pushToNative();
    buildMarkers(fresh);
    statusEl.textContent = `Loaded from API: ${fresh.length}`;
  } catch (e) {
    statusEl.textContent = cached.length ? "Using cached stations (offline?)" : "Could not load stations (offline?)";
  }
}

function toggleNight() {
  nightMode = !nightMode;
  globe.material.map = nightMode ? textures.night : textures.day;
  globe.material.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);

  clouds.rotation.y += 0.0005;

  const t = Date.now() * 0.005;
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const pulse = 0.30 + Math.sin(t + i) * 0.06;
    m.scale.set(pulse, pulse, pulse);
  }

  TWEEN.update();
  renderer.render(scene, camera);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

$("btnNight").addEventListener("click", toggleNight);
$("btnReload").addEventListener("click", () => loadStations({ force: true }));
$("btnApply").addEventListener("click", applyFilters);

renderPanels();
initThree();
loadStations();
pushToNative();
