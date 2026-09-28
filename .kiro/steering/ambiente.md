---
inclusion: always
---

# Ambiente de execução (obrigatório)

O Kiro roda no Windows, mas o projeto vive dentro do WSL (Ubuntu-22.04). O terminal do agente abre no
Windows com caminho `\\wsl.localhost\...`, onde symlinks, `;` e códigos de saída não funcionam direito.

**Todo comando de terminal deve ser executado assim:**

```
wsl.exe -d Ubuntu-22.04 -- bash -c "cd /home/edmilsonh/projects/orion-hq/orion-hq-kiro && <comando>"
```

Para comandos de Node (npm, npx, node), carregue o nvm antes, se existir:

```
wsl.exe -d Ubuntu-22.04 -- bash -c "source ~/.nvm/nvm.sh 2>/dev/null; cd /home/edmilsonh/projects/orion-hq/orion-hq-kiro && npm run build"
```

Não usar `bash -lic` nem `bash -ic`: o terminal do agente não é interativo e esses modos falham.

## Regras

- Nunca rodar `npm`, `node`, `python`, `pip` ou `pytest` direto no terminal do Windows.
- Python: usar sempre o ambiente virtual do projeto em `.venv` (já existe e está com as dependências).
  Instalar pacotes com `.venv/bin/python -m pip install -r requirements-dev.txt` (inclui o
  `requirements.txt` de produção + `pytest`, `uvicorn`, `pgserver`). Nunca usar `pip` global/`--user`.
- `requirements.txt` fica só com o que roda em produção, com versões fixas; ferramentas de
  desenvolvimento vão no `requirements-dev.txt`.
- Se precisar recriar o `.venv`: o Ubuntu não tem `python3-venv`, então usar
  `python3 -m venv --without-pip .venv` e instalar o pip com `get-pip.py`, sem sudo.
- Rodar testes com `.venv/bin/pytest`.
- Python local é 3.10 (Vercel usa 3.12): o código deve funcionar nos dois, sem recursos exclusivos do 3.12.
- Se um comando falhar por ambiente (symlink, lock, cwd), pare e peça ao usuário em vez de tentar contornos.
- Nunca rodar `pkill`, apagar `.next` ou usar `sudo` sem pedir.