const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const nowEl = $("nowPlaying");
const favEl = $("favorites");
const recEl = $("recents");
const audio = $("player");

let scene, camera, renderer, controls;
let globe, clouds, atmosphere;
let markers = [];
let currentMarker = null;

let nightMode = false;
let textures = {};
const RADIUS = 5.0;

/* ---------------- STORAGE ---------------- */

function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function getFavorites() { return readLS("favorites", []); }
function getRecents() { return readLS("recents", []); }
function getAllStations() { return readLS("cachedStations", []); }

function stationKey(st) {
  return (st.stationuuid || "") + "|" + (st.stream || "");
}

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

/* ---------------- THREE SETUP ---------------- */

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

  scene.add(new THREE.AmbientLight(0x2a2a2a));

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
    new THREE.MeshBasicMaterial({
      color: 0x3399ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide
    })
  );
  scene.add(atmosphere);

  window.addEventListener("resize", onResize);
  onResize();

  setupPointerControls();
  animate();
}

function onResize() {
  const w = $("globeWrap").clientWidth;
  const h = $("globeWrap").clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------------- MARKERS ---------------- */

function clearMarkers() {
  markers.forEach(m => scene.remove(m));
  markers = [];
  currentMarker = null;
}

function buildMarkers(stations) {
  clearMarkers();
  const subset = stations.slice(0, 1200);

  subset.forEach((st, i) => {
    const pos = latLngToVector3(st.lat, st.lng, RADIUS + 0.12);

    const mat = new THREE.SpriteMaterial({
      color: 0xff00aa,
      blending: THREE.AdditiveBlending
    });

    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(0.32, 0.32, 0.32);
    s.userData = st;

    scene.add(s);
    markers.push(s);
  });

  statusEl.textContent = `Markers: ${markers.length}`;
}

function highlightMarker(marker) {
  if (currentMarker) currentMarker.material.color.set(0xff00aa);
  marker.material.color.set(0x00ffcc);
  currentMarker = marker;
}

/* ---------------- INTERACTION ---------------- */

const raycaster = new THREE.Raycaster();
raycaster.params.Sprite.threshold = 0.6;

const mouse = new THREE.Vector2();

function setMouse(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickMarker(ev) {
  setMouse(ev);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(markers);
  return hits.length ? hits[0].object : null;
}

function setupPointerControls() {
  let downX = 0, downY = 0, moved = false;
  let pressTimer = null;

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    downX = ev.clientX;
    downY = ev.clientY;
    moved = false;

    pressTimer = setTimeout(() => {
      const m = pickMarker(ev);
      if (m) toggleFavorite(m.userData);
    }, 450);
  });

  renderer.domElement.addEventListener("pointermove", (ev) => {
    const dx = Math.abs(ev.clientX - downX);
    const dy = Math.abs(ev.clientY - downY);
    if (dx + dy > 10) {
      moved = true;
      if (pressTimer) clearTimeout(pressTimer);
    }
  });

  renderer.domElement.addEventListener("pointerup", (ev) => {
    if (pressTimer) clearTimeout(pressTimer);

    if (moved) return;

    const m = pickMarker(ev);
    if (!m) return;

    const st = m.userData;
    highlightMarker(m);
    focusOn(m);
    playStation(st);
    saveRecent(st);
  });
}

/* ---------------- PLAYBACK ---------------- */

function playStation(st) {
  if (!st?.stream) return;

  const title = `${st.name || "Station"}${st.country ? " · " + st.country : ""}`;
  nowEl.textContent = title;

  if (window.AndroidBridge?.playStream) {
    try { window.AndroidBridge.playStream(st.stream, title); }
    catch {}
    return;
  }

  audio.src = st.stream;
  audio.play().catch(()=>{});
}

function saveRecent(st) {
  const rec = getRecents();
  const k = stationKey(st);
  writeLS("recents", [st, ...rec.filter(x => stationKey(x) !== k)].slice(0, 15));
  pushToNative();
  renderPanels();
}

function toggleFavorite(st) {
  const fav = getFavorites();
  const k = stationKey(st);
  const exists = fav.some(x => stationKey(x) === k);
  writeLS("favorites", exists ? fav.filter(x => stationKey(x) !== k) : [st, ...fav]);
  pushToNative();
  renderPanels();
}

/* ---------------- CAMERA FOCUS ---------------- */

function focusOn(marker) {
  const target = marker.position.clone().normalize().multiplyScalar(10);
  new TWEEN.Tween(camera.position)
    .to({ x: target.x, y: target.y, z: target.z }, 900)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
}

/* ---------------- PANELS ---------------- */

function makeStationButton(st, prefix="") {
  const btn = document.createElement("button");
  btn.className = "cardbtn";
  btn.innerHTML = `<div class="t">${prefix}${st.name}</div>
                   <div class="s">${st.country || ""}</div>`;
  btn.onclick = () => { playStation(st); saveRecent(st); };
  return btn;
}

function renderPanels() {
  favEl.innerHTML = "";
  recEl.innerHTML = "";
  getFavorites().forEach(st => favEl.appendChild(makeStationButton(st,"★ ")));
  getRecents().forEach(st => recEl.appendChild(makeStationButton(st,"⟲ ")));
}

/* ---------------- API ---------------- */

async function fetchStations() {
  const res = await fetch("https://de1.api.radio-browser.info/json/stations/topclick/800");
  const raw = await res.json();

  return raw.map(s => ({
    stationuuid: s.stationuuid,
    name: s.name,
    country: s.country,
    favicon: s.favicon,
    stream: s.url_resolved || s.url,
    lat: parseFloat(s.geo_lat),
    lng: parseFloat(s.geo_long)
  })).filter(s =>
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lng) &&
    s.stream?.startsWith("http")
  );
}

async function loadStations() {
  statusEl.textContent = "Loading stations…";
  try {
    const fresh = await fetchStations();
    writeLS("cachedStations", fresh);
    pushToNative();
    buildMarkers(fresh);
    statusEl.textContent = `Loaded ${fresh.length} stations`;
  } catch {
    statusEl.textContent = "Offline or API error";
  }
}

/* ---------------- ANIMATION ---------------- */

function animate() {
  requestAnimationFrame(animate);

  clouds.rotation.y += 0.0005;

  const t = Date.now() * 0.005;
  markers.forEach((m,i)=>{
    const pulse = 0.32 + Math.sin(t+i)*0.07;
    m.scale.set(pulse,pulse,pulse);
  });

  TWEEN.update();
  renderer.render(scene, camera);
}

/* ---------------- INIT ---------------- */

initThree();
renderPanels();
loadStations();
pushToNative();
