import { createApp } from 'vue'
import App from './App.vue'
import { installWindowGuards } from './workspace'
import './styles.css'

installWindowGuards()
createApp(App).mount('#app')
