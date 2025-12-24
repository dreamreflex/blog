<template>
  <div class="search-box">
    <input
      v-model="q"
      @input="onInput"
      :placeholder="placeholder"
      class="search-input"
    />
    <ul v-if="showResults" class="search-results">
      <li v-for="r in results" :key="r.url" class="search-item">
        <a :href="r.url">{{ r.title }}</a>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import MiniSearch from 'minisearch'

const q = ref('')
const docs = ref([])
const results = ref([])
let mini = null
const placeholder = '搜索站点...'

onMounted(async () => {
  try {
    const res = await fetch('/search-index.json')
    docs.value = await res.json()
    mini = new MiniSearch({
      fields: ['title', 'text'],
      storeFields: ['title', 'url'],
      searchOptions: {
        prefix: true,
      },
    })
    // add with numeric ids (minisearch expects unique ids)
    mini.addAll(docs.value.map((d, i) => ({ id: i, ...d })))
  } catch (e) {
    // ignore fetch/index errors
    console.warn('搜索索引加载失败', e)
  }
})

function onInput() {
  if (!mini || !q.value) {
    results.value = []
    return
  }
  const res = mini.search(q.value, { prefix: true })
  results.value = res.map(r => ({ title: r.title, url: r.url }))
}

const showResults = computed(() => q.value && results.value.length)
</script>

<style scoped>
.search-box { position: relative; display: flex; align-items: center; }
.search-input { padding: 6px 8px; border: 1px solid #dcdcdc; border-radius: 4px; width: 220px; }
.search-results { position: absolute; top: 36px; left: 0; background: var(--vp-c-bg); border: 1px solid #eee; list-style: none; margin: 0; padding: 0; width: 320px; max-height: 320px; overflow: auto; z-index: 50; }
.search-item { padding: 8px 10px; }
.search-item a { color: inherit; text-decoration: none; }
.search-item:hover { background: #f5f5f5; }
</style>


