const state = {
  activeTab: 'math',
  uploads: JSON.parse(localStorage.getItem('uploads') || '{}'),
  maxSizeMB: Number(localStorage.getItem('maxSizeMB') || 50),
  bestRangeMB: Number(localStorage.getItem('bestRangeMB') || 30),
  model: localStorage.getItem('model') || 'GPT-4.1',
  offlineMode: localStorage.getItem('offlineMode') === '1',
  englishMode: 'cn-to-en',
  selectedOption: null,
  extractedWords: []
};

const sampleWords = [
  { cn: '严谨的', en: 'rigorous', wrong: ['vivid', 'fragile', 'casual'] },
  { cn: '提升', en: 'enhance', wrong: ['ignore', 'avoid', 'delay'] }
];

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const toastWrap = document.getElementById('toastWrap');
const progressWrap = document.getElementById('progressWrap');
const barFill = document.getElementById('barFill');
const progressText = document.getElementById('progressText');
const progressTitle = document.getElementById('progressTitle');

function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = msg;
  toastWrap.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function switchTab(tab) {
  state.activeTab = tab;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
}

tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

function ensureBucket(module) {
  if (!state.uploads[module]) state.uploads[module] = [];
}

async function runProgress(taskText = '正在处理文件...') {
  progressTitle.textContent = taskText;
  progressWrap.classList.remove('hidden');
  for (let i = 1; i <= 100; i++) {
    barFill.style.width = `${i}%`;
    progressText.textContent = `${i}%`;
    await new Promise((r) => setTimeout(r, 12));
  }
  progressWrap.classList.add('hidden');
}

async function handleUpload(input) {
  const module = input.dataset.module;
  const type = input.dataset.type;
  const files = [...input.files];
  if (!files.length) return;

  const oversized = files.find((f) => f.size > state.maxSizeMB * 1024 * 1024);
  if (oversized) {
    showToast(`文件 ${oversized.name} 超过限制 ${state.maxSizeMB}MB`, true);
    input.value = '';
    return;
  }

  await runProgress(module === 'math' ? '数学题目提取中（强化数学符号识别）...' : '文件解析中...');

  ensureBucket(module);
  files.forEach((file) => {
    state.uploads[module].push({
      name: file.name,
      size: file.size,
      type,
      timestamp: new Date().toISOString()
    });
  });

  localStorage.setItem('uploads', JSON.stringify(state.uploads));
  refreshDeleteSelectors();
  showToast(`上传成功：${files.length} 个文件已加入 ${module} 模块`);
  input.value = '';
}

document.querySelectorAll('input[type="file"]').forEach((input) => {
  input.addEventListener('change', () => handleUpload(input));
});

// 数学示例解析
const mathBtn = document.querySelector('[data-reveal="math"]');
mathBtn.addEventListener('click', () => document.getElementById('mathAnswer').classList.remove('hidden'));

// 英语模式与题目
function renderEnglishQuiz() {
  const mode = state.englishMode;
  const item = sampleWords[0];
  const opts = mode === 'cn-to-en' ? [item.en, ...item.wrong] : [item.cn, '提升', '轻率', '拖延'];
  const shuffled = opts.map((v) => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map((o) => o.v);

  document.getElementById('englishStem').textContent =
    mode === 'cn-to-en' ? `“${item.cn}” 对应哪个英文单词？` : `“${item.en}” 对应哪个中文词义？`;

  const wrap = document.getElementById('englishOptions');
  wrap.innerHTML = '';
  state.selectedOption = null;

  shuffled.forEach((op, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${String.fromCharCode(65 + idx)}. ${op}`;
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedOption = op;
    });
    wrap.appendChild(btn);
  });
}

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.englishMode = btn.dataset.mode;
    renderEnglishQuiz();
  });
});

document.getElementById('checkEnglish').addEventListener('click', () => {
  const ans = document.getElementById('englishAnswer');
  const target = state.englishMode === 'cn-to-en' ? 'rigorous' : '严谨的';
  const ok = state.selectedOption === target;
  ans.classList.remove('hidden');
  ans.innerHTML = `<p><strong>${ok ? '回答正确' : '回答不正确'}</strong></p>
  <p>解析册：rigorous = 严谨的。</p>
  <p>AI解析：通过词根与语义场记忆，搭配“逻辑严谨”场景可强化理解。</p>`;
});

// 英语 PDF 提词（简化：从二进制文本中提取英文）
document.getElementById('extractWords').addEventListener('click', async () => {
  const files = [...(document.querySelector('input[data-module="english"]').files || [])];
  if (!files.length) {
    showToast('请先选择英语单词 PDF 文件', true);
    return;
  }

  await runProgress('正在提取英文单词...');
  const words = new Set();

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('latin1').decode(buffer);
    const found = text.match(/[A-Za-z]{2,}/g) || [];
    found.forEach((w) => words.add(w.toLowerCase()));
  }

  state.extractedWords = [...words].slice(0, 2000);
  document.getElementById('wordOutput').value = state.extractedWords.join('\n');
  showToast(`提取完成：${state.extractedWords.length} 个英文词`);
});

document.getElementById('speakWord').addEventListener('click', () => {
  const w = state.extractedWords[0];
  if (!w) {
    showToast('请先提取单词后再朗读', true);
    return;
  }
  const utter = new SpeechSynthesisUtterance(w);
  utter.lang = 'en-US';
  speechSynthesis.speak(utter);
  showToast(`朗读中：${w}`);
});

// 408模块卡片
const subjects = ['数据结构', '计算机组成原理', '操作系统', '计算机网络'];
const subjects408 = document.getElementById('subjects408');
subjects.forEach((name) => {
  const card = document.createElement('div');
  card.className = 'subj-card';
  card.innerHTML = `
    <h3>${name}</h3>
    <label>题目册 PDF <input type="file" multiple accept="application/pdf" data-module="408-${name}" data-type="question"></label>
    <label>解析册 PDF <input type="file" multiple accept="application/pdf" data-module="408-${name}" data-type="analysis"></label>
  `;
  subjects408.appendChild(card);
});
subjects408.querySelectorAll('input[type="file"]').forEach((input) => {
  input.addEventListener('change', () => handleUpload(input));
});

// 设置
const maxFileSize = document.getElementById('maxFileSize');
const sizeValue = document.getElementById('sizeValue');
maxFileSize.value = state.maxSizeMB;
sizeValue.textContent = `${state.maxSizeMB}MB`;
maxFileSize.addEventListener('input', () => {
  state.maxSizeMB = Number(maxFileSize.value);
  sizeValue.textContent = `${state.maxSizeMB}MB`;
  localStorage.setItem('maxSizeMB', state.maxSizeMB);
});

const aiBestRange = document.getElementById('aiBestRange');
const bestRangeValue = document.getElementById('bestRangeValue');
aiBestRange.value = state.bestRangeMB;
bestRangeValue.textContent = `${state.bestRangeMB}MB 内最佳`;
aiBestRange.addEventListener('input', () => {
  state.bestRangeMB = Number(aiBestRange.value);
  bestRangeValue.textContent = `${state.bestRangeMB}MB 内最佳`;
  localStorage.setItem('bestRangeMB', state.bestRangeMB);
});

const modelSelect = document.getElementById('modelSelect');
modelSelect.value = state.model;
modelSelect.addEventListener('change', () => {
  state.model = modelSelect.value;
  localStorage.setItem('model', state.model);
  showToast(`已切换大模型：${state.model}`);
});

const offlineToggle = document.getElementById('offlineToggle');
function renderOffline() {
  offlineToggle.textContent = `离线模式：${state.offlineMode ? '开启' : '关闭'}`;
}
offlineToggle.addEventListener('click', () => {
  state.offlineMode = !state.offlineMode;
  localStorage.setItem('offlineMode', state.offlineMode ? '1' : '0');
  renderOffline();
  showToast(state.offlineMode ? '已开启离线模式（可查看历史题库记录）' : '已关闭离线模式');
});

const deleteModule = document.getElementById('deleteModule');
const deleteFile = document.getElementById('deleteFile');
function refreshDeleteSelectors() {
  const modules = Object.keys(state.uploads).filter((m) => state.uploads[m]?.length);
  deleteModule.innerHTML = modules.length
    ? modules.map((m) => `<option value="${m}">${m}</option>`).join('')
    : '<option value="">暂无可删除文件</option>';
  refreshDeleteFiles();
}

function refreshDeleteFiles() {
  const module = deleteModule.value;
  const files = state.uploads[module] || [];
  deleteFile.innerHTML = files.length
    ? files.map((f, i) => `<option value="${i}">${f.name} (${f.type})</option>`).join('')
    : '<option value="">该模块暂无文件</option>';
}

deleteModule.addEventListener('change', refreshDeleteFiles);
document.getElementById('deleteFileBtn').addEventListener('click', () => {
  const module = deleteModule.value;
  const idx = Number(deleteFile.value);
  if (!module || Number.isNaN(idx) || !state.uploads[module]?.[idx]) {
    showToast('未找到可删除文件', true);
    return;
  }
  const [removed] = state.uploads[module].splice(idx, 1);
  localStorage.setItem('uploads', JSON.stringify(state.uploads));
  refreshDeleteSelectors();
  showToast(`已删除：${removed.name}`);
});

renderEnglishQuiz();
refreshDeleteSelectors();
renderOffline();
switchTab('math');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
