<script setup lang="ts">
import Header from './components/Header.vue'
import { handleDownloadButtonClick } from './download-handler'
</script>

<template>
  <Header @download="handleDownloadButtonClick" />
</template>
