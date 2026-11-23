# Reto Técnico 02 — Agente Conversacional "Registro de Contratos Vigentes"

Solución completa e independiente para automatizar la recepción, extracción, validación, archivo y alerta de contratos vigentes desde un buzón único, desarrollada en **TypeScript** sobre **Bun**.

## Enlace de prueba

- **URL pública:** `https://<tu-despliegue-o-tunel>` *(reemplazar antes de la entrega; si se prueba en local durante la defensa, indicar `http://localhost:3000`)*
- **Autenticación:** Pública (sin credenciales requeridas).

---

## Requisitos previos

- **Bun** (`v1.1+`) instalado en el equipo.
- Una clave de API de un proveedor LLM compatible con OpenAI (o instancia local como Ollama) únicamente para usar el chat interactivo. `demo.ts` **no** requiere clave ni conexión a LLM.

---

## Arranque rápido en local (< 2 minutos)

1. **Instalar dependencias:**
   ```bash
   bun install