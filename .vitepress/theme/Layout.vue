<script setup>
import DefaultTheme from 'vitepress/theme'
import SearchBox from './components/SearchBox.vue'
</script>

<template>
  <DefaultTheme>
    <template #navbar-extra>
      <SearchBox />
    </template>
  </DefaultTheme>
</template>


