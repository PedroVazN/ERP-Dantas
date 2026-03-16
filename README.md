# E-Sentinel - Sabonetes

ERP moderno completo para operacao comercial de sabonetes, com frontend React + TypeScript (Vite), backend Node + Express + TypeScript e banco MongoDB.

## Funcionalidades implementadas

- Dashboard executivo com KPIs:
  - faturamento
  - despesas
  - lucro
  - contas a receber
  - alerta de estoque minimo
- Modulo de clientes (cadastro e listagem)
- Modulo de produtos (cadastro e controle de estoque)
- Modulo de vendas (baixa automatica no estoque)
- Modulo de compras (entrada automatica no estoque)
- Modulo financeiro (despesas e contas a pagar)
- Configuracao de tema persistida por usuario
- 6 temas visuais selecionaveis: `claro`, `escuro`, `oceano`, `sabonete`, `rosa` e `neutro`

## Arquitetura

- `client`: React + TypeScript + Vite
- `server`: Express + TypeScript + Mongoose
- API REST em `http://localhost:4000/api`

## Configuracao de ambiente

### 1) Backend

Copie `server/.env.example` para `server/.env` e configure:

```env
PORT=4000
MONGODB_URI=sua_string_mongodb_atlas
CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,https://e-sentinel.vercel.app
ALLOW_VERCEL_PREVIEWS=true
DNS_SERVERS=8.8.8.8,1.1.1.1
ADMIN_EMAIL=seu_admin@dominio.com
ADMIN_PASSWORD=SUA_SENHA_FORTE_AQUI
```

> Use a sua URI MongoDB Atlas no campo `MONGODB_URI`.

### 2) Frontend

Copie `client/.env.example` para `client/.env`:

```env
VITE_API_URL=http://localhost:4000/api
```

## Deploy separado na Vercel

### Backend (projeto `server`)

- Defina no projeto da Vercel:
  - `MONGODB_URI`
  - `CLIENT_URL` (URL principal do frontend)
  - `CLIENT_URLS` (origens permitidas separadas por virgula)
    - exemplo: `https://e-sentinel.vercel.app,http://localhost:5173`
  - `ALLOW_VERCEL_PREVIEWS` (`true` para permitir previews `*.vercel.app`)
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - opcional: `DNS_SERVERS`
- O backend ja esta preparado para serverless com:
  - `server/vercel.json`
  - entrada `server/api/index.ts`

### Frontend (projeto `client`)

- Defina no projeto da Vercel:
  - `VITE_API_URL=https://seu-backend.vercel.app/api`
- O frontend ja esta preparado para SPA na Vercel com:
  - `client/vercel.json`

## Execucao

Na raiz do projeto:

```bash
npm install
npm run dev
```

Isso inicia:

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Build de producao

```bash
npm run build
```

## Observacoes

- A aplicacao foi modelada para um ERP de pequeno e medio porte focado em sabonetes.
- A base pode ser expandida para:
  - multiempresa
  - multiloja
  - fiscal (NFe/NFCe)
  - permissao por perfil (RBAC)
  - pedidos B2B/B2C
  - BI avancado e previsao de demanda
