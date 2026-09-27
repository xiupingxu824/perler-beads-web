import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import axios from 'axios'

axios.interceptors.request.use(config => {
  const token = localStorage.getItem('perler-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
axios.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401) {
    localStorage.removeItem('perler-token')
    localStorage.removeItem('perler-user')
    localStorage.removeItem('perler-user-id')
    window.dispatchEvent(new Event('auth-expired'))
  }
  return Promise.reject(error)
})
createApp(App).mount('#app')
