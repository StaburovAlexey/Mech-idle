# Визуальные и звуковые материалы

Модели турели и врагов поставляются локально в `public/assets/oplot/`, модули реакторной арены — в `public/assets/reactor/`. Если GLB недоступны, остаются процедурные запасные модели. Внешних запросов к авторам ассетов во время игры нет.

Визуальное направление: предоставленные пользователем сгенерированные концепты «Турель и мехи / Концепт 01» и утверждённый «Враги / 2D концепт 02», с кремово-бирюзовой турелью и красно-графитовыми мехами. Исходные изображения не включены в репозиторий и не загружаются игрой. Процедурные резервные модели — упрощённая интерпретация этих силуэтов.

Звуковые эффекты генерируются Web Audio API. Внешних аудиозаписей нет.

## Модели на арене (CC0 1.0)

- **PolygonDan**, [3D Turret PBR texture + Flat Diff Texture](https://opengameart.org/content/3d-turret-pbr-texture-flat-diff-texture). Из FBX и авторской цветовой текстуры без PBR собран `turret.glb`. Основание, вращающаяся верхняя часть и ствол с отдачей разделены; текстура уменьшена.
- **Quaternius**, [Animated Mech Pack](https://quaternius.com/packs/animatedmech), GLB из [конвертации trebeljahr/quaternius-showcase](https://github.com/trebeljahr/quaternius-showcase/tree/main/public/glb/mech_pack). Mike — Штурм, Leela — Рывок, Stan — Стрелок, George — Колосс. Оставлены только используемые клипы, текстуры уменьшены. Анимации подстроены под исходные фазы боя.
- **Quaternius**, [Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit), бесплатная версия Standard, CC0. В один GLB объединены Door_Frame_A, Door_DarkMetal, ShortWall_DarkMetal2_Straight, Column_Pipes и Prop_Crate3; текстуры уменьшены до 256 px. Металлическая палуба, два реактора, подсветка и резервные ворота сделаны геометрией Three.js по концепту.

Суммарный размер GLB не равен объёму видеопамяти. Оригинальные исходники и лицензии доступны на страницах авторов. [Текст CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

## Зависимости

- [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE): MIT
- [Vite](https://github.com/vitejs/vite/blob/main/LICENSE): MIT
- [Vitest](https://github.com/vitest-dev/vitest/blob/main/LICENSE): MIT
- [jsdom](https://github.com/jsdom/jsdom/blob/main/LICENSE.txt): MIT, только для DOM-тестов и отдельной CPU-проекции моделей
- [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt): Apache-2.0
- [DefinitelyTyped / @types/three и @types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE): MIT

Зависимости и их транзитивные пакеты сохраняют собственные лицензии, приложенные к npm-пакетам. package-lock.json фиксирует точные версии и контрольные суммы. Эта страница не заменяет тексты лицензий зависимостей.

## Интерфейс: оригинальные наборы Kenney (CC0)

Автор: Kenney, https://kenney.nl. Оба набора разрешены для личных и коммерческих проектов по [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Оригинальные тексты License.txt включены рядом с каждым набором. Изображения взяты из архивов автора, не из демонстрационных скриншотов.

### UI Pack: Sci-Fi

- Страница: https://kenney.nl/assets/ui-pack-sci-fi
- Архив: https://kenney.nl/media/pages/assets/ui-pack-sci-fi/b67c2acd31-1724181109/kenney_ui-pack-space-expansion.zip
- `PNG/Extra/Default/panel_glass_screws.png` → `public/assets/ui/kenney-sci-fi/panel_glass_screws.png`: прямоугольные светлые поверхности главного меню, результатов, диалогов и меню боя; тонкий исходный край и небольшие винты
- `PNG/Blue/Default/button_square_header_large_rectangle_screws.png` → `public/assets/ui/kenney-sci-fi/button_square_header_large_rectangle_screws.png`: синяя полоса заголовка и светлая нижняя часть панелей, ресурсов и меню боя
- `PNG/Blue/Default/bar_round_gloss_small.png` → `public/assets/ui/kenney-sci-fi/bar_round_gloss_small.png`: синяя полоса здоровья турели
- `PNG/Red/Default/bar_round_gloss_small.png` → `public/assets/ui/kenney-sci-fi/bar_round_gloss_small_red.png`: красная полоса при низком здоровье турели и полоса Колосса
- `PNG/Extra/Default/bar_shadow_round_outline_small.png` → `public/assets/ui/kenney-sci-fi/bar_shadow_round_outline_small.png`: подложка полос здоровья
- Лицензия: `public/assets/ui/kenney-sci-fi/License.txt`

### UI Pack

- Страница: https://kenney.nl/assets/ui-pack
- Архив: https://kenney.nl/media/pages/assets/ui-pack/f651646eab-1718203990/kenney_ui-pack.zip
- `PNG/Blue/Default/button_rectangle_depth_flat.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_flat.png`: основные действия, в том числе начало и возврат в бой; также знак оплота
- `PNG/Blue/Default/button_rectangle_depth_gloss.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_gloss.png`: наведение на основное действие
- `PNG/Blue/Default/button_rectangle_flat.png` → `public/assets/ui/kenney-ui/button_rectangle_flat.png`: нажатое основное действие
- `PNG/Grey/Default/button_rectangle_depth_flat.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_flat_grey.png`: нейтральные вторичные действия, кнопка меню и четыре улучшения
- `PNG/Grey/Default/button_rectangle_depth_gloss.png` → `public/assets/ui/kenney-ui/button_rectangle_depth_gloss_grey.png`: наведение на нейтральную кнопку или доступное улучшение
- `PNG/Grey/Default/button_rectangle_flat.png` → `public/assets/ui/kenney-ui/button_rectangle_flat_grey.png`: нажатые и недоступные нейтральные кнопки, компактные ячейки характеристик
- `PNG/Red/Default/icon_cross.png` → `public/assets/ui/kenney-ui/icon_cross_red.png`: оригинальный красный крестик закрытия меню, 18×18 внутри области нажатия 44×44
- Лицензия: `public/assets/ui/kenney-ui/License.txt`

Все 12 PNG сохранены побайтово без изменений. Их исходные цвета и заполненные центральные области используются напрямую, без CSS-фильтров, тонирования и пониженной прозрачности. Панель 64×64 использует сегменты по 12 исходным пикселям: сохраняются тонкий край и маленькие винты, без крупных срезанных углов. Заголовок 192×64 имеет фиксированную высоту 64 CSS-пикселя и исходную цветную полосу высотой 32 пикселя; по горизонтали растягиваются только центральные части, винты и углы сохраняют исходный размер. Кнопки 192×64 используют 8-пиксельные исходные сегменты с отображением края шириной 4 CSS-пикселя. Полосы здоровья 96×16 масштабируются как цельные изображения.

Композиция следует демонстрациям автора: прямоугольные серые поверхности, небольшие синие заголовки, нейтральные вторичные кнопки и одно выделенное основное действие. Меню боя содержит компактные характеристики, две колонки вторичных действий и отдельную кнопку завершения забега. У всех его кнопок область нажатия не меньше 44 пикселей. Неиспользуемые прежние изображения крупных вырезов, синей двойной рамки и красной полноразмерной кнопки удалены из поставляемого набора.

SHA-256 и пути внутри архивов приведены в `public/assets/ui/manifest.json`. Шрифты из наборов не включены: используется системный шрифт с поддержкой кириллицы. Верхние ресурсы и нижние улучшения находятся в отдельных строках CSS Grid; 3D-поле занимает только среднюю строку и не рисуется под игровыми панелями. Эта коррекция не меняет правила игры, сохранения, камеру или геометрию появления мехов.

## Геометрия врагов и руин

Четыре резервные модели созданы программно: отдельные планы тел, суставы, срезанные бронепанели, поршни, клинки, ствол, вентиляция и крепёж. Геометрия, анимации, материалы руин и размещение объектов оригинальные. Рисунок из концепта не использован как текстура. CPU-сравнение строится Three.js SVGRenderer из тех же геометрий и поз, что использует игра; его упрощённое освещение отличается от WebGL-рендера.
