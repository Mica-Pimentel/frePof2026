# frePof · Visão ao vivo

Visão computacional pela webcam, 100% no navegador, com [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/guide) **1.0.1**.

## Modos

| Tecla | Modo | O que faz |
|---|---|---|
| `1` | **Mãos** | Reconhece gestos de até 2 mãos, conta dedos levantados e permite **desenhar no ar** com o indicador (mão aberta por 1,5 s apaga). |
| `2` | **Rosto** | Detecta expressões (feliz, rindo, surpreso, bravo, triste, piscadinha…), conta piscadas, mostra para onde você olha e os músculos mais ativos. |
| `3` | **Corpo** | Esqueleto do corpo, ângulos de joelho/cotovelo e **contador de repetições** (agachamento, rosca bíceps, polichinelo). |
| `4` | **Objetos** | Detecta e conta 80 tipos de objetos, com nomes em português. |
| `5` | **Fundo** | Desfoque, cor sólida, preto e branco ou imagem própria atrás de você. |

Outros atalhos: `Espaço` liga/desliga a câmera · `S` salva uma foto · `M` espelha.

Também tem: troca de câmera, tema claro/escuro, FPS e tempo de processamento, e link direto para cada modo (`index.html#rosto`, `#corpo`…).

## Como rodar

A câmera só funciona em `https://` ou em `localhost`. Na pasta do projeto:

```bash
python -m http.server 8000
# abra http://localhost:8000
```

Ou publique no GitHub Pages / Netlify / Vercel (qualquer hospedagem estática).

## Estrutura

```
index.html
css/style.css
js/app.js            # câmera, loop, abas, foto, atalhos
js/core/vision.js    # versão da biblioteca e URLs dos modelos
js/core/ui.js        # componentes do painel
js/core/draw.js      # rótulos, caixas, ângulos
js/modes/*.js        # um arquivo por modo
```

Para adicionar um modo novo, crie um arquivo em `js/modes/` com `load`, `mount`, `frame` e `dispose`, e registre em `js/app.js`.

Para atualizar a biblioteca, troque a versão em `js/core/vision.js`.
