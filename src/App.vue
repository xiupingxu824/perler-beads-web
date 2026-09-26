<script setup lang="ts">
import { computed, ref } from 'vue'
import axios from 'axios'

type Color = { code: string; name: string; hex: string; quantity: number }
const width = ref(28), height = ref(28), maxColors = ref(16), zoom = ref(1.12)
const selected = ref('#ff6b6b'), message = ref(''), fileName = ref('尚未选择图片'), sourceImage = ref('')
const fileInput = ref<HTMLInputElement>()
const undoStack = ref<string[][]>([]), redoStack = ref<string[][]>([])
const colors = ref<Color[]>([
  { code:'A01', name:'珊瑚红', hex:'#FF6B6B', quantity:126 }, { code:'A02', name:'奶油黄', hex:'#FFD166', quantity:98 },
  { code:'A03', name:'晴空蓝', hex:'#70D6FF', quantity:112 }, { code:'A04', name:'薄荷绿', hex:'#8CE99A', quantity:85 },
  { code:'A05', name:'薰衣草', hex:'#A78BFA', quantity:74 }, { code:'A06', name:'蜜桃橙', hex:'#FF9F68', quantity:63 },
  { code:'A07', name:'深灰', hex:'#34313F', quantity:119 }, { code:'A08', name:'象牙白', hex:'#FFFDF8', quantity:107 }
])
const palette = colors.value.map(c => c.hex)
const cells = ref<string[]>([])
const total = computed(() => width.value * height.value)
function generate() { cells.value = Array.from({length: total.value}, (_, i) => { const r = Math.floor(i / width.value), c = i % width.value; return (r > 4 && r < height.value - 5 && c > 4 && c < width.value - 5) ? palette[(r+c)%6] : '#FFFDF8' }); refreshStats(); notify('图纸已重新生成') }
function choose(color: Color) { selected.value = color.hex }
function pick(i: number) { undoStack.value.push([...cells.value]); redoStack.value = []; cells.value[i] = selected.value; refreshStats(); notify('已修改一个拼豆颜色') }
function notify(text: string) { message.value = text; window.setTimeout(() => message.value = '', 1800) }
function refreshStats() { const count = new Map<string, number>(); cells.value.forEach(c => count.set(c, (count.get(c) || 0) + 1)); colors.value.forEach(c => c.quantity = count.get(c.hex) || 0) }
function undo() { const last = undoStack.value.pop(); if (last) { redoStack.value.push([...cells.value]); cells.value = last; refreshStats() } }
function redo() { const next = redoStack.value.pop(); if (next) { undoStack.value.push([...cells.value]); cells.value = next; refreshStats() } }
function saveProject() { localStorage.setItem('perler-project', JSON.stringify({ width: width.value, height: height.value, cells: cells.value, fileName: fileName.value })); notify('作品已保存到浏览器') }
function loadProject() { const raw = localStorage.getItem('perler-project'); if (!raw) return notify('暂时没有保存的作品'); const data = JSON.parse(raw); width.value=data.width; height.value=data.height; cells.value=data.cells; fileName.value=data.fileName || '已保存作品'; refreshStats(); notify('已恢复上次保存的作品') }
function download(name: string, data: Blob) { const url=URL.createObjectURL(data), a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url) }
function exportJson() { download('perler-pattern.json', new Blob([JSON.stringify({width:width.value,height:height.value,cells:cells.value}, null, 2)], {type:'application/json'})); notify('JSON 图纸已导出') }
function exportCsv() { download('perler-pattern.csv', new Blob([cells.value.slice(0,height.value).map((_,r)=>cells.value.slice(r*width.value,(r+1)*width.value).join(',')).join('\n')], {type:'text/csv;charset=utf-8'})); notify('CSV 图纸已导出') }
function exportPng() { const canvas=document.createElement('canvas'), size=20; canvas.width=width.value*size; canvas.height=height.value*size; const ctx=canvas.getContext('2d')!; cells.value.forEach((color,i)=>{const x=(i%width.value)*size,y=Math.floor(i/width.value)*size;ctx.fillStyle=color;ctx.fillRect(x,y,size,size);ctx.strokeStyle='#d7d2df';ctx.strokeRect(x,y,size,size)}); canvas.toBlob(blob=>blob&&download('perler-pattern.png',blob),'image/png'); notify('PNG 图纸已导出') }
function handleFile(event: Event) { const file=(event.target as HTMLInputElement).files?.[0]; if (!file) return; fileName.value=file.name; const reader=new FileReader(); reader.onload=()=>{sourceImage.value=String(reader.result); const image=new Image(); image.onload=()=>generateFromImage(image); image.src=sourceImage.value}; reader.readAsDataURL(file) }
function generateFromImage(image: HTMLImageElement) { const canvas=document.createElement('canvas'); canvas.width=width.value; canvas.height=height.value; const ctx=canvas.getContext('2d')!; ctx.drawImage(image,0,0,width.value,height.value); const pixels=ctx.getImageData(0,0,width.value,height.value).data; const result:string[]=[]; for(let i=0;i<width.value*height.value;i++){const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2]; let best=palette[0],distance=Infinity; palette.forEach(color=>{const n=parseInt(color.slice(1),16),cr=n>>16,cg=(n>>8)&255,cb=n&255,d=(r-cr)**2+(g-cg)**2+(b-cb)**2;if(d<distance){distance=d;best=color}});result.push(best)}; undoStack.value.push([...cells.value]); cells.value=result; refreshStats(); notify('图片已转换为拼豆图纸') }
async function generateFromApi() { if (sourceImage.value) { const image=new Image(); image.onload=()=>generateFromImage(image); image.src=sourceImage.value; return } try { const res = await axios.post('/api/pattern/generate', { width: width.value, height: height.value, maxColors: maxColors.value }); if (res.data.success) { cells.value = res.data.data.matrix.flat().map((code: string) => colors.value.find(c => c.code === code)?.hex || '#FFFDF8'); refreshStats(); notify('已从后端生成图纸') } } catch { generate(); notify('后端未启动，已使用本地预览数据') } }
generate()
</script>

<template>
  <header class="topbar"><div class="brand"><b>◆</b> PERLER BEADS</div><nav><span class="active">制作图纸</span><span @click="loadProject">我的作品</span><span>颜色库</span><span>灵感社区</span></nav><div class="user">帮助中心 <i>林</i></div></header>
  <section class="hero"><div><small>PERLER PATTERN STUDIO</small><h1>把喜欢的图片，变成拼豆图纸</h1><p>上传图片，调整颜色与尺寸，开始你的下一件手作。</p></div><div><button class="light" @click="saveProject">⌘ 保存作品</button><button class="primary" @click="exportPng">↓ 导出 PNG</button></div></section>
  <main class="workspace">
    <aside class="panel settings"><h3>图纸设置 <em>STEP 1 / 3</em></h3><div class="upload"><div class="upload-icon">↥</div><strong>{{ fileName }}</strong><span>支持 JPG、PNG，最大 10MB</span><button class="light" @click="fileInput?.click()">选择图片</button><input ref="fileInput" type="file" accept="image/png,image/jpeg" hidden @change="handleFile"></div><label>图纸尺寸 <small>建议 20–80 格</small><div class="row"><input v-model.number="width" type="number" min="4" max="80"><b>×</b><input v-model.number="height" type="number" min="4" max="80"></div></label><label>颜色数量 <small>{{ maxColors }} 色</small><input v-model.number="maxColors" type="range" min="4" max="32"></label><label>颜色品牌<select><option>豆趣标准色库</option><option>Perler</option><option>Hama</option></select></label><p class="check"><input type="checkbox" checked> 保持图片比例</p><p class="check"><input type="checkbox"> 开启颜色抖动</p><p class="check"><input type="checkbox" checked> 显示网格线</p><button class="generate" @click="generateFromApi">✦ 生成拼豆图纸</button></aside>
    <section class="editor"><div class="editor-head"><b>图纸编辑器</b><div><button class="tool" @click="undo">↶</button><button class="tool" @click="redo">↷</button><button class="tool active">▦</button><button class="tool" @click="exportJson">JSON</button><button class="tool" @click="exportCsv">CSV</button></div></div><div class="stage"><div class="grid" :style="{gridTemplateColumns:`repeat(${width}, 16px)`, transform:`scale(${zoom})`}"><button v-for="(cell,i) in cells" :key="i" class="cell" :style="{background:cell}" @click="pick(i)"></button></div></div><footer>点击网格可修改颜色 · 当前工具：画笔 <span><button class="tool" @click="zoom=Math.max(.7,zoom-.1)">−</button>{{ Math.round(zoom*100) }}%<button class="tool" @click="zoom=Math.min(1.8,zoom+.1)">＋</button></span></footer></section>
    <aside class="panel stats"><h3>作品信息 <em>实时统计</em></h3><div class="summary"><div><small>总拼豆数</small><strong>{{ total }}</strong></div><div><small>颜色种类</small><strong>{{ colors.filter(c => c.quantity > 0).length }}</strong></div><div><small>图纸尺寸</small><strong>{{ width }}×{{ height }}</strong></div><div><small>预估成本</small><strong>¥{{ (total * 0.016).toFixed(1) }}</strong></div></div><h3>颜色清单 <em>数量</em></h3><div v-for="color in colors" :key="color.code" class="color" @click="choose(color)"><i :style="{background:color.hex}"></i><span class="code">{{ color.code }}</span><span>{{ color.name }}</span><b :style="{width: Math.min(100, color.quantity / Math.max(1,total) * 1000) + '%', background: color.hex}"></b><small>{{ color.quantity }}</small></div><div class="tip">小提示：点击颜色后，再点击网格可以修改单颗拼豆。作品保存到浏览器后，下次可以直接恢复。</div></aside>
  </main><div v-if="message" class="toast">{{ message }}</div>
</template>
