# Визуальные и звуковые материалы

Все модели турели, обычного меха, быстрого меха, Колосса, арены, окружения, частиц, значков и favicon созданы для этого прототипа процедурно или простыми SVG/Unicode средствами. Внешние игровые модели и шрифты не загружаются. Для интерфейса используются оригинальные PNG Kenney, перечисленные ниже.

Визуальное направление: предоставленный пользователем сгенерированный концепт «Турель и мехи / Концепт 01», с кремово-бирюзовой турелью и красно-графитовыми мехами. Исходное изображение не включено в репозиторий и не загружается игрой. Модели — новая упрощённая интерпретация силуэтов, не ассеты сторонней игры.

Звуковые эффекты генерируются Web Audio API. Внешних аудиозаписей нет.

## Зависимости

- [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE): MIT
- [Vite](https://github.com/vitejs/vite/blob/main/LICENSE): MIT
- [Vitest](https://github.com/vitest-dev/vitest/blob/main/LICENSE): MIT
- [jsdom](https://github.com/jsdom/jsdom/blob/main/LICENSE.txt): MIT, только для DOM-тестов
- [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt): Apache-2.0
- [DefinitelyTyped / @types/three и @types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE): MIT

Зависимости и их транзитивные пакеты сохраняют собственные лицензии, приложенные к npm-пакетам. package-lock.json фиксирует точные версии и контрольные суммы. Эта страница не заменяет тексты лицензий зависимостей.

## Интерфейс: оригинальные наборы Kenney (CC0)

Автор: Kenney, https://kenney.nl. Оба набора разрешены для личных и коммерческих проектов по [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Оригинальные тексты License.txt включены рядом с каждым набором. Изображения взяты из архивов автора, не из демонстрационных скриншотов.

### UI Pack: Sci-Fi

- Страница: https://kenney.nl/assets/ui-pack-sci-fi
- Архив: https://kenney.nl/media/pages/assets/ui-pack-sci-fi/b67c2acd31-1724181109/kenney_ui-pack-space-expansion.zip
- `PNG/Extra/Default/panel_glass_notches.png` → `public/assets/ui/kenney-sci-fi/panel_glass_notches.png`: девятисегментная рамка ресурсов и меню боя
- `PNG/Blue/Default/bar_round_gloss_small.png` → `public/assets/ui/kenney-sci-fi/bar_round_gloss_small.png`: полоса здоровья турели
- Лицензия: `public/assets/ui/kenney-sci-fi/License.txt`

### UI Pack

- Страница: https://kenney.nl/assets/ui-pack
- Архив: https://kenney.nl/media/pages/assets/ui-pack/f651646eab-1718203990/kenney_ui-pack.zip
- `PNG/Blue/Default/button_rectangle_depth_border.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_border.png`: девятисегментные рамки четырёх улучшений, кнопок и переключателя меню боя
- `PNG/Blue/Default/button_rectangle_depth_flat.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_flat.png`: основная кнопка возврата в бой
- Лицензия: `public/assets/ui/kenney-ui/License.txt`

Все четыре PNG сохранены побайтово без изменений. Оттенок, прозрачность и масштабирование задаются только CSS; центральная заливка рамок опущена там, где нужна тёмная подложка. SHA-256 и пути внутри архивов приведены в `public/assets/ui/manifest.json`. Шрифты из наборов не включены: используется системный шрифт с поддержкой кириллицы.
