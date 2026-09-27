<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import axios from 'axios'

type Color = { id?: number; code: string; name: string; hex: string; quantity: number }
const width = ref(60), height = ref(80), maxColors = ref(64), zoom = ref(1.12)
const lastGeneratedWidth = ref<number | null>(null), lastRequestedWidth = ref<number | null>(null)
const keepRatio = ref(true)
const selected = ref('#ff6b6b'), message = ref(''), fileName = ref('尚未选择图片'), sourceImage = ref('')
const showGrid = ref(true)
const uploadedFileId = ref<string | null>(null)
const uploading = ref(false)
const generating = ref(false)
const generateError = ref('')
const fileInput = ref<HTMLInputElement>()
const patternCanvas = ref<HTMLCanvasElement>()
const undoStack = ref<string[][]>([]), redoStack = ref<string[][]>([])
const projectId = ref<string | null>(null)
function tokenIsValid() { try { const token=localStorage.getItem('perler-token'); if(!token) return false; const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); return Number(payload.exp) * 1000 > Date.now() } catch { return false } }
const loggedIn = ref(tokenIsValid())
const loginForm = ref({ username: 'admin', password: '123456' })
const loginError = ref('')
const colors = ref<Color[]>([
  { code:'A01', name:'珊瑚红', hex:'#FF6B6B', quantity:126 }, { code:'A02', name:'奶油黄', hex:'#FFD166', quantity:98 },
  { code:'A03', name:'晴空蓝', hex:'#70D6FF', quantity:112 }, { code:'A04', name:'薄荷绿', hex:'#8CE99A', quantity:85 },
  { code:'A05', name:'薰衣草', hex:'#A78BFA', quantity:74 }, { code:'A06', name:'蜜桃橙', hex:'#FF9F68', quantity:63 },
  { code:'A07', name:'深灰', hex:'#34313F', quantity:119 }, { code:'A08', name:'象牙白', hex:'#FFFDF8', quantity:107 }
])
const colorCatalog = ref<Color[]>([])
const palette = colors.value.map(c => c.hex)
const cells = ref<string[]>([])
const selectedColorGroup = ref('ALL')
const total = computed(() => cells.value.filter(Boolean).length)
const activeColors = computed(() => colors.value.filter(c => c.quantity > 0))
const colorGroups = computed(() => Array.from(new Set(colorCatalog.value.map(c => c.code.match(/^[A-Za-z]+/)?.[0] || 'OTHER'))).sort())
const colorGroupCounts = computed(() => Object.fromEntries(colorGroups.value.map(group => [group, colorCatalog.value.filter(c => (c.code.match(/^[A-Za-z]+/)?.[0] || 'OTHER') === group).length])))
const filteredColors = computed(() => selectedColorGroup.value === 'ALL' ? colorCatalog.value : colorCatalog.value.filter(c => (c.code.match(/^[A-Za-z]+/)?.[0] || 'OTHER') === selectedColorGroup.value))
const usedColors = computed(() => colors.value.filter(c => c.quantity > 0).sort((a,b) => b.quantity - a.quantity))
const cellCodes = computed(() => cells.value.map(hex => colors.value.find(c => c.hex.toLowerCase() === hex.toLowerCase())?.code || ''))
const canvasCellSize = 22, canvasLabelSize = 42
const canvasWidth = computed(() => width.value * canvasCellSize + canvasLabelSize * 2)
const canvasHeight = computed(() => height.value * canvasCellSize + canvasLabelSize * 2)
function generate() { cells.value = Array.from({length: width.value * height.value}, () => ''); refreshStats() }
function choose(color: Color) { selected.value = color.hex }
function pick(i: number) { undoStack.value.push([...cells.value]); redoStack.value = []; cells.value[i] = selected.value; refreshStats(); notify('已修改一个拼豆颜色') }
function drawPattern() {
  const canvas = patternCanvas.value; if (!canvas) return
  const dpr = window.devicePixelRatio || 1, w = canvasWidth.value, h = canvasHeight.value
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.font = '700 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#111'
  for (let c=0;c<width.value;c++) { const x=canvasLabelSize+c*canvasCellSize+canvasCellSize/2; ctx.fillText(String(c+1),x,canvasLabelSize/2); ctx.fillText(String(c+1),x,h-canvasLabelSize/2) }
  for (let r=0;r<height.value;r++) { const y=canvasLabelSize+r*canvasCellSize+canvasCellSize/2; ctx.fillText(String(r+1),canvasLabelSize/2,y); ctx.fillText(String(r+1),w-canvasLabelSize/2,y) }
  const showCodes = zoom.value >= .6
  for (let r=0;r<height.value;r++) for (let c=0;c<width.value;c++) {
    const i=r*width.value+c, x=canvasLabelSize+c*canvasCellSize, y=canvasLabelSize+r*canvasCellSize, hex=cells.value[i] || '#FFFDF8'
    ctx.fillStyle=hex; ctx.fillRect(x,y,canvasCellSize,canvasCellSize)
    if (showGrid) { ctx.strokeStyle='#8d8d8d'; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,canvasCellSize-1,canvasCellSize-1) }
    const code=cellCodes.value[i]; if (showCodes && code) { const n=parseInt(hex.slice(1),16), lum=(((n>>16)&255)*299+(((n>>8)&255))*587+(n&255)*114)/1000; ctx.fillStyle=lum<145?'#fff':'#333'; ctx.font='700 9px Arial, sans-serif'; ctx.fillText(code,x+canvasCellSize/2,y+canvasCellSize/2) }
  }
  ctx.strokeStyle='#333'; ctx.lineWidth=2; ctx.strokeRect(canvasLabelSize,canvasLabelSize,width.value*canvasCellSize,height.value*canvasCellSize)
}
function pickCanvas(event: MouseEvent) { const canvas=patternCanvas.value; if(!canvas) return; const rect=canvas.getBoundingClientRect(); const x=(event.clientX-rect.left)/zoom.value-canvasLabelSize, y=(event.clientY-rect.top)/zoom.value-canvasLabelSize; const col=Math.floor(x/canvasCellSize), row=Math.floor(y/canvasCellSize); if(col>=0&&col<width.value&&row>=0&&row<height.value) pick(row*width.value+col) }
function notify(text: string) { message.value = text; window.setTimeout(() => message.value = '', 1800) }
async function login() { loginError.value = ''; if (!loginForm.value.username || !loginForm.value.password) { loginError.value = '请输入账号和密码'; return } try { const res = await axios.post('/api/auth/login', loginForm.value); if (!res.data.success) { loginError.value = res.data.message || '账号或密码错误'; return } localStorage.setItem('perler-token', res.data.data.token); localStorage.setItem('perler-user', res.data.data.username); localStorage.setItem('perler-user-id', String(res.data.data.id)); loggedIn.value = true; await loadColors(); await nextTick(); drawPattern(); notify('登录成功') } catch { loginError.value = '账号或密码错误，或登录接口无法连接' } }
function logout() { loggedIn.value = false; localStorage.removeItem('perler-token'); localStorage.removeItem('perler-user'); localStorage.removeItem('perler-user-id'); notify('已退出登录') }
function handleAuthExpired() { loggedIn.value = false; uploadedFileId.value = null; generateError.value = '登录已过期，请重新登录'; }
function refreshStats() { const count = new Map<string, number>(); cells.value.forEach(c => count.set(c, (count.get(c) || 0) + 1)); colors.value.forEach(c => c.quantity = count.get(c.hex) || 0) }
function undo() { const last = undoStack.value.pop(); if (last) { redoStack.value.push([...cells.value]); cells.value = last; refreshStats() } }
function redo() { const next = redoStack.value.pop(); if (next) { undoStack.value.push([...cells.value]); cells.value = next; refreshStats() } }
async function saveProject() { try { const res=await axios.post('/api/projects', { id:projectId.value, userId:Number(localStorage.getItem('perler-user-id') || 1), name:fileName.value === '尚未选择图片' ? '我的拼豆图纸' : fileName.value, width:width.value, height:height.value, brandId:1, maxColors:maxColors.value, sourceImageId:uploadedFileId.value, patternData:JSON.stringify({width:width.value,height:height.value,cells:cells.value,codes:cellCodes.value}) }); projectId.value=res.data.data.id; notify('作品已保存到后台') } catch { notify('保存失败，请确认后端和数据库已启动') } }
async function loadProject() { try { const res=await axios.get('/api/projects', {params:{userId:Number(localStorage.getItem('perler-user-id') || 1)}}); const data=res.data.data?.[0]; if(!data) return notify('暂时没有保存的作品'); const pattern=JSON.parse(data.patternData); projectId.value=data.id; width.value=pattern.width; height.value=pattern.height; cells.value=pattern.cells; fileName.value=data.name; refreshStats(); notify('已从后台恢复作品') } catch { notify('读取作品失败，请确认后端和数据库已启动') } }
function download(name: string, data: Blob) { const url=URL.createObjectURL(data), a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url) }
function pngFileName() { const now=new Date(), pad=(value:number)=>String(value).padStart(2,'0'); return `豆想玩-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png` }
async function exportJson() { if(!projectId.value) await saveProject(); if(!projectId.value) return; try { const res=await axios.get(`/api/projects/${projectId.value}/export/json`, {responseType:'blob'}); download('perler-pattern.json', res.data); notify('JSON 图纸已从后台导出') } catch { notify('导出失败，请确认后端已启动') } }
async function exportCsv() { if(!projectId.value) await saveProject(); if(!projectId.value) return; try { const res=await axios.get(`/api/projects/${projectId.value}/export/csv`, {responseType:'blob'}); download('perler-pattern.csv',res.data); notify('CSV 图纸已从后台导出') } catch { notify('导出失败，请确认后端已启动') } }
async function exportPng() { if(!projectId.value) await saveProject(); if(!projectId.value) return; try { const res=await axios.get(`/api/projects/${projectId.value}/export/png`, {responseType:'blob'}); download(pngFileName(),res.data); notify('PNG 图纸已从后台导出') } catch { notify('导出失败，请确认后端已启动') } }
async function handleFile(event: Event) { const file=(event.target as HTMLInputElement).files?.[0]; if (!file) return; projectId.value=null; uploadedFileId.value=null; sourceImage.value=''; generateError.value=''; uploading.value=true; fileName.value=file.name; const reader=new FileReader(); reader.onload=async()=>{sourceImage.value=String(reader.result); try { const form=new FormData(); form.append('file',file); const res=await axios.post('/api/files/upload',form); uploadedFileId.value=res.data.data.fileId; notify(`最新图片已上传`) } catch { notify('图片上传失败'); } finally { uploading.value=false } }; reader.readAsDataURL(file) }
function generateFromImage(image: HTMLImageElement) { const canvas=document.createElement('canvas'); canvas.width=width.value; canvas.height=height.value; const ctx=canvas.getContext('2d')!; ctx.drawImage(image,0,0,width.value,height.value); const pixels=ctx.getImageData(0,0,width.value,height.value).data; const result:string[]=[]; for(let i=0;i<width.value*height.value;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2]; let best=palette[0],distance=Infinity; palette.forEach(color=>{const n=parseInt(color.slice(1),16),cr=n>>16,cg=(n>>8)&255,cb=n&255,d=(r-cr)**2+(g-cg)**2+(b-cb)**2;if(d<distance){distance=d;best=color}});result.push(best)}; undoStack.value.push([...cells.value]); cells.value=result; refreshStats(); notify('图片已转换为拼豆图纸') }
async function generateFromApi() { generateError.value=''; if (uploading.value) { generateError.value='图片仍在上传，请稍候'; return } if (!uploadedFileId.value) { generateError.value='请先选择并完成图片上传'; return } generating.value=true; try { const requestedWidth=lastGeneratedWidth.value===width.value && lastRequestedWidth.value!==null ? lastRequestedWidth.value : width.value; const res = await axios.post('/api/pattern/generate', { width: requestedWidth, height: height.value, maxColors: maxColors.value, brandId:1, keepRatio:keepRatio.value, dithering:false, fileId:uploadedFileId.value, imageBase64:null }); if (!res.data.success) throw new Error(res.data.message || '后台生成失败'); const result=res.data.data; projectId.value=null; lastRequestedWidth.value=requestedWidth; lastGeneratedWidth.value=result.width; width.value=result.width; colors.value=result.colors.map((c:Color)=>({...c})); if (!colorCatalog.value.length) colorCatalog.value=result.colors.map((c:Color)=>({...c,quantity:0})); cells.value = result.matrix.flat().map((code: string) => colors.value.find(c => c.code === code)?.hex || '#FFFDF8'); refreshStats(); notify(`识别完成，需要 ${colors.value.filter(c => c.quantity > 0).length} 种颜色，共 ${result.totalBeads} 颗拼豆`) } catch (error: any) { generateError.value=error?.response?.data?.message || error?.message || '生成失败，请检查后端日志'; } finally { generating.value=false } }
async function loadColors() { try { const res=await axios.get('/api/colors', {params:{brandId:1}}); if(res.data.success && res.data.data.length) { const loaded=res.data.data.map((c:Color)=>({...c,quantity:0})); colors.value=loaded; colorCatalog.value = loaded.map((c: Color) => ({ ...c }));} } catch { notify('颜色库读取失败，请确认数据库已初始化') } }
onMounted(() => { window.addEventListener('auth-expired', handleAuthExpired); if (loggedIn.value) loadColors() })
watch([cells, width, height, zoom, showGrid, colors], drawPattern, { deep: true })
generate()
</script>

<template>
  <section v-if="!loggedIn" class="login-page">
    <div class="login-decoration"><div class="floating-bead bead-a"></div><div class="floating-bead bead-b"></div><div class="floating-bead bead-c"></div><div class="mini-grid"><i v-for="n in 36" :key="n"></i></div></div>
    <div class="login-card"><img class="login-banner" src="/login-brand-banner.png?v=1" alt="豆想玩品牌横幅"><h1>欢迎回来</h1><p>登录后继续制作你的拼豆图纸</p><form @submit.prevent="login"><label>账号<input v-model="loginForm.username" placeholder="请输入账号"></label><label>密码<input v-model="loginForm.password" type="password" placeholder="请输入密码"></label><div v-if="loginError" class="login-error">{{ loginError }}</div><button class="primary login-submit" type="submit">登录</button></form><div class="login-hint">演示账号：admin　密码：123456</div><div class="login-footer">还没有账号？<span @click="notify('注册功能将在下一版接入')">立即注册</span></div></div>
  </section>
  <template v-else>
  <header class="topbar">
    <div class="brand brand-logo">
      <img src="/perler-brand-logo-tight.png?v=3" alt="豆想玩品牌标识">
    </div>
    <nav>
      <span class="active">制作图纸</span>
      <span @click="loadProject">我的作品（即将见面）</span>
      <span >由小许冠名支持！！！！</span>
    </nav>
    <div class="user" @click="logout">
      退出登录<div v-if="message" class="toast">{{ message }}</div>
      <i>许</i>
    </div>
  </header>
  <section class="hero"><div><h1>把喜欢的图片，变成拼豆图纸</h1></div></section>
  <main class="workspace">
    <aside class="panel settings"><h3>上传图纸 </h3><div class="upload" role="button" tabindex="0" @click="fileInput?.click()"><div class="upload-icon">↥</div><strong>{{ fileName }}</strong><span>支持 JPG、PNG，最大 10MB</span><input ref="fileInput" type="file" accept="image/png,image/jpeg" hidden @click.stop @change="handleFile"></div><label>图纸尺寸 <small>建议 20–120 格</small><div class="row"><input v-model.number="width" type="number" min="4" max="120"><b>×</b><input v-model.number="height" type="number" min="4" max="120"></div></label>
      <p class="check"><input v-model="showGrid" type="checkbox"> 显示网格线</p>
      <button class="generate" :disabled="generating || uploading" @click="generateFromApi">{{ uploading ? '图片上传中…' : (generating ? '生成中，请稍候…' : '✦ 生成拼豆图纸') }}</button><p v-if="generateError" class="generate-error">{{ generateError }}</p></aside>
    <section class="editor"><div class="editor-head"><b>图纸编辑器</b><div class="editor-tools"><span class="zoom-tools"><button class="tool" @click="zoom=Math.max(.3,zoom-.1)">−</button><em>{{ Math.round(zoom*100) }}%</em><button class="tool" @click="zoom=Math.min(1.8,zoom+.1)">＋</button></span><button class="tool" @click="undo">↶</button><button class="tool" @click="redo">↷</button><button class="tool export-tool" @click="exportPng">↓ 导出 PNG</button></div></div><div class="stage"><div class="pattern-sheet" :style="{transform:`scale(${zoom})`}"><div></div><div class="axis top-axis"><span v-for="n in width" :key="`top-${n}`">{{ n }}</span></div><div></div><div class="axis side-axis"><span v-for="n in height" :key="`left-${n}`">{{ n }}</span></div><div class="code-grid" :class="{'grid-lines': showGrid}" :style="{gridTemplateColumns:`repeat(${width}, 22px)`}"><button v-for="(cell,i) in cells" :key="i" class="code-cell" :style="{background:cell || '#FFFDF8'}" @click="pick(i)"><span>{{ cellCodes[i] }}</span></button></div><div class="axis side-axis"><span v-for="n in height" :key="`right-${n}`">{{ n }}</span></div><div></div><div class="axis top-axis"><span v-for="n in width" :key="`bottom-${n}`">{{ n }}</span></div><div></div></div></div><section class="pattern-materials"><div class="materials-head"><div>
      <b>Color： {{ usedColors.length }}
       · Count：
      {{ total }} </b>
    </div></div><div v-if="usedColors.length" class="materials-grid"><div v-for="color in usedColors" :key="color.code" class="material-item"><i :style="{background:color.hex}"></i><div><strong>{{ color.code }}</strong></div><b>x{{ color.quantity }}</b></div></div><div v-else class="materials-empty">生成图纸后，这里会显示每种颜色的编码和使用数量</div></section></section>
    <aside class="pa:nel stats"><h3>图纸信息 <em>实时统计</em></h3><div class="summary"><div><small>总拼豆数</small><strong>{{ total }}</strong></div><div><small>颜色种类</small><strong>{{ colors.filter(c => c.quantity > 0).length }}</strong></div><div><small>图纸尺寸</small><strong>{{ width }}×{{ height }}</strong></div><div></div></div><div class="color-title"><h3>颜色清单</h3><select v-model="selectedColorGroup" class="group-select"><option value="ALL">全部颜色 · {{ colorCatalog.length }} 色</option><option v-for="group in colorGroups" :key="group" :value="group">{{ group }} 系列 · {{ colorGroupCounts[group] }} 色</option></select></div><div class="color-list"><div v-for="color in filteredColors" :key="color.code" class="color" @click="choose(color)"><span class="code">{{ color.code }}</span><b :style="{width: '100%', background: color.hex}"></b></div></div><div class="tip">小提示：颜色编号前缀会自动分组，例如 A1、A2、A3 会归入 A 系列。点击颜色后，再点击网格可以修改单颗拼豆。</div></aside>
  </main>
  </template>
</template>
