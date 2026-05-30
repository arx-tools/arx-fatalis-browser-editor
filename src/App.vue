<script setup lang="ts">
import { handleDownloadButtonClick } from './main'
import { uiTitle, isLoading } from './ui/ui'
</script>

<template>
  <header>
    <h2>{{ uiTitle }}</h2>
    <button :disabled="isLoading !== 'fulfilled'" @click="handleDownloadButtonClick">
      <i class="fa-solid fa-download"></i>
      Download
    </button>
  </header>
</template>

<style lang="scss" scoped>
header {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: #2c2828;
  color: #d3c0c0;

  h2 {
    margin: 0;
  }
}
</style>
