<script setup lang="ts">
import Header from './components/Header.vue'
import { handleDownloadButtonClick } from './main'
</script>

<template>
  <Header @download="handleDownloadButtonClick" />
</template>
