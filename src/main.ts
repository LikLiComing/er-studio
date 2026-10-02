import { createApp } from 'vue'
import App from './App.vue'
import { ensureParser } from './model/parser-loader'
import { installWindowGuards } from './workspace'
import './styles.css'

installWindowGuards()
void ensureParser().then(() => {
  window.dispatchEvent(new CustomEvent('er-studio-parser-ready'))
})
createApp(App).mount('#app')
