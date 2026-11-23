# Reto Técnico 02 — Agente Conversacional "Registro de Contratos Vigentes"

Solución completa e independiente para automatizar la recepción, extracción, validación, archivo y alerta de contratos vigentes desde un buzón único, desarrollada en **TypeScript** sobre **Bun** y desplegada en **Docker** con soporte para **Ollama** local (o cualquier endpoint compatible con la API de OpenAI)[cite: 6, 7].

## Enlace de prueba

- **URL local / defensa:** `http://localhost:3000` *(o `https://<tu-despliegue-o-tunel>` si se expone públicamente)*[cite: 6]
- **Autenticación:** Pública (sin credenciales requeridas)[cite: 6].

---

## Requisitos previos

- **Docker** y **Docker Compose** (o **Bun** `v1.1+` en local)[cite: 6].
- **Ollama** corriendo en el host con el modelo configurado (ej. `qwen2.5:14b`) únicamente para usar el chat interactivo en `http://localhost:3000`. La ejecución determinista (`demo.ts`) **no** requiere LLM ni clave API[cite: 6, 7].

---

## Arranque rápido con Docker

1. **Verificar Ollama en el equipo host:**
   ```bash
   ollama list