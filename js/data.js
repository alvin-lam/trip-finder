/*
 * Destination dataset for Where to Travel.
 *
 * City tag string: eight digits (0-5) in this order:
 *   beach, culture, food, nature, nightlife, adventure, shopping, relax
 * Popularity: 1 (hidden gem) to 5 (iconic, busy).
 * Country cost: 1 (very cheap) to 5 (very expensive).
 * temps: average daily high in °C for Jan..Dec at a representative location.
 * best: months (1-12) generally considered the best time to visit.
 * A city may override its country's best months with a fifth element.
 *
 * Figures are rough planning guides, not authoritative travel advice.
 */
(function (root) {
  const INTERESTS = [
    { id: "beach", label: "Beaches", icon: "🏖️" },
    { id: "culture", label: "Culture & history", icon: "🏛️" },
    { id: "food", label: "Food & drink", icon: "🍜" },
    { id: "nature", label: "Nature & scenery", icon: "🏔️" },
    { id: "nightlife", label: "Nightlife", icon: "🎉" },
    { id: "adventure", label: "Adventure", icon: "🧗" },
    { id: "shopping", label: "Shopping & markets", icon: "🛍️" },
    { id: "relax", label: "Relaxation", icon: "🧘" },
  ];

  const REGIONS = [
    { id: "wne", name: "Western & Northern Europe", icon: "🏰", blurb: "World-class museums, efficient trains and dramatic northern landscapes." },
    { id: "seu", name: "Southern Europe", icon: "🍋", blurb: "Mediterranean coastlines, ancient history and long, sunny dinners." },
    { id: "cee", name: "Central & Eastern Europe", icon: "🎻", blurb: "Storybook old towns, thermal baths and great value for money." },
    { id: "eas", name: "East Asia", icon: "🏯", blurb: "Futuristic cities, ancient temples and some of the world's best food." },
    { id: "sea", name: "Southeast Asia", icon: "🌴", blurb: "Tropical islands, street food and budget-friendly adventure." },
    { id: "sas", name: "South Asia", icon: "🪷", blurb: "Palaces, spice markets, Himalayan treks and Indian Ocean atolls." },
    { id: "mena", name: "Middle East & North Africa", icon: "🕌", blurb: "Desert landscapes, souks, ancient wonders and modern skylines." },
    { id: "ssa", name: "Sub-Saharan Africa", icon: "🦁", blurb: "Safari wildlife, vast deserts and spice-island beaches." },
    { id: "nam", name: "North America", icon: "🗽", blurb: "Iconic cities, epic national parks and diverse food scenes." },
    { id: "cac", name: "Central America & Caribbean", icon: "🌺", blurb: "Rainforests, volcanoes, Maya ruins and turquoise water." },
    { id: "sam", name: "South America", icon: "🦙", blurb: "Andean peaks, Patagonian wilderness and vibrant cities." },
    { id: "oce", name: "Oceania & Pacific", icon: "🐨", blurb: "Reefs, fjords, outback and laid-back island life." },
  ];

  // [name, tags, popularity, blurb, bestOverride?]
  const COUNTRIES = [
    // ---------- Western & Northern Europe ----------
    { id: "fr", name: "France", flag: "🇫🇷", region: "wne", lat: 46.6, lon: 2.2, cost: 4, best: [4, 5, 6, 9, 10],
      temps: [7, 8, 12, 16, 20, 23, 25, 25, 21, 16, 10, 8], currency: "Euro (EUR)", language: "French",
      blurb: "Art, wine and cuisine, from Parisian boulevards to the Alps and the Riviera.",
      cities: [
        ["Paris", "05514152", 5, "Art, cafés and grand boulevards in the classic city break."],
        ["Nice", "43433234", 4, "Riviera promenades, pebble beaches and hilltop village day trips.", [5, 6, 7, 8, 9]],
        ["Lyon", "04523133", 3, "France's food capital, with Roman ruins and hidden passageways."],
        ["Chamonix", "01352513", 3, "Alpine town beneath Mont Blanc for hiking and skiing.", [1, 2, 3, 6, 7, 8, 9]],
      ] },
    { id: "gb", name: "United Kingdom", flag: "🇬🇧", region: "wne", lat: 54, lon: -2, cost: 4, best: [5, 6, 7, 8, 9],
      temps: [8, 9, 12, 15, 18, 21, 23, 23, 20, 16, 11, 8], currency: "Pound (GBP)", language: "English",
      blurb: "Royal history, theatre, countryside walks and rugged Scottish highlands.",
      cities: [
        ["London", "05425152", 5, "Museums, theatre and markets in a sprawling world capital."],
        ["Edinburgh", "05334233", 4, "Medieval old town, castle views and Arthur's Seat hikes."],
        ["Inverness & the Highlands", "12251414", 2, "Gateway to lochs, glens and the Isle of Skye."],
      ] },
    { id: "nl", name: "Netherlands", flag: "🇳🇱", region: "wne", lat: 52.1, lon: 5.3, cost: 4, best: [4, 5, 6, 9],
      temps: [6, 7, 10, 14, 18, 20, 23, 22, 19, 15, 10, 7], currency: "Euro (EUR)", language: "Dutch",
      blurb: "Canals, cycling and masterpieces, all within a short train ride.",
      cities: [
        ["Amsterdam", "14325243", 5, "Canals, bikes and world-class museums."],
        ["Utrecht", "03323134", 2, "Relaxed canal city with a lively student scene."],
        ["Rotterdam", "03414142", 2, "Bold modern architecture and a buzzing food hall."],
      ] },
    { id: "no", name: "Norway", flag: "🇳🇴", region: "wne", lat: 64.5, lon: 11.5, cost: 5, best: [6, 7, 8],
      temps: [0, 1, 5, 10, 16, 20, 22, 21, 16, 10, 4, 1], currency: "Krone (NOK)", language: "Norwegian",
      blurb: "Fjords, midnight sun and northern lights in one of Europe's wildest landscapes.",
      cities: [
        ["Bergen", "03352424", 3, "Colourful harbour town and gateway to the fjords."],
        ["Oslo", "04333233", 3, "Waterfront museums, saunas and forest trails."],
        ["Tromsø", "02252513", 3, "Arctic base for the northern lights and midnight sun.", [1, 2, 3, 6, 7, 11, 12]],
      ] },

    // ---------- Southern Europe ----------
    { id: "it", name: "Italy", flag: "🇮🇹", region: "seu", lat: 42.8, lon: 12.5, cost: 4, best: [4, 5, 6, 9, 10],
      temps: [12, 13, 16, 19, 23, 28, 31, 31, 27, 22, 16, 13], currency: "Euro (EUR)", language: "Italian",
      blurb: "Ancient ruins, Renaissance art, coastal villages and legendary food.",
      cities: [
        ["Rome", "05514142", 5, "Ancient ruins, Baroque piazzas and endless trattorias."],
        ["Florence", "05523143", 5, "Renaissance art capital surrounded by Tuscan vineyards."],
        ["Amalfi Coast", "43442325", 4, "Cliffside villages, lemon groves and boat days.", [5, 6, 9]],
        ["Venice", "05412133", 5, "Car-free lagoon city of canals and palazzi."],
      ] },
    { id: "es", name: "Spain", flag: "🇪🇸", region: "seu", lat: 40.4, lon: -3.7, cost: 3, best: [4, 5, 6, 9, 10],
      temps: [12, 14, 17, 19, 23, 28, 31, 31, 26, 21, 15, 12], currency: "Euro (EUR)", language: "Spanish",
      blurb: "Tapas, flamenco, late nights and some of Europe's sunniest coastlines.",
      cities: [
        ["Barcelona", "45525243", 5, "Gaudí architecture, beaches and late-night tapas."],
        ["Seville", "05414133", 4, "Flamenco, orange trees and Moorish palaces.", [3, 4, 5, 10, 11]],
        ["Madrid", "05515152", 4, "Grand art museums and a famously late nightlife."],
        ["Mallorca", "52343325", 4, "Coves, mountain villages and cycling routes.", [5, 6, 7, 8, 9]],
      ] },
    { id: "gr", name: "Greece", flag: "🇬🇷", region: "seu", lat: 39.1, lon: 21.8, cost: 3, best: [5, 6, 9, 10],
      temps: [13, 14, 17, 20, 25, 30, 33, 33, 29, 24, 19, 15], currency: "Euro (EUR)", language: "Greek",
      blurb: "Island hopping, whitewashed villages and the birthplace of democracy.",
      cities: [
        ["Athens", "25414132", 4, "The Acropolis, lively tavernas and rooftop bars."],
        ["Santorini", "42433225", 5, "Caldera sunsets, volcanic beaches and cliffside hotels."],
        ["Crete", "53443424", 3, "Gorge hikes, Minoan palaces and long sandy beaches."],
      ] },
    { id: "pt", name: "Portugal", flag: "🇵🇹", region: "seu", lat: 39.4, lon: -8.2, cost: 3, best: [4, 5, 6, 9, 10],
      temps: [15, 16, 19, 20, 22, 26, 28, 28, 27, 23, 18, 15], currency: "Euro (EUR)", language: "Portuguese",
      blurb: "Atlantic surf, tiled facades, port wine and warm hospitality.",
      cities: [
        ["Lisbon", "34524233", 5, "Hilly streets, trams, pastel de nata and sunset viewpoints."],
        ["Porto", "24524133", 4, "Riverside wine cellars and azulejo-covered churches."],
        ["Algarve", "51434415", 3, "Golden cliffs, sea caves and surf beaches.", [5, 6, 7, 8, 9]],
      ] },
    { id: "hr", name: "Croatia", flag: "🇭🇷", region: "seu", lat: 45.1, lon: 15.2, cost: 3, best: [5, 6, 9],
      temps: [11, 12, 14, 18, 23, 27, 30, 30, 26, 21, 16, 12], currency: "Euro (EUR)", language: "Croatian",
      blurb: "Walled Adriatic towns, island ferries and turquoise national parks.",
      cities: [
        ["Dubrovnik", "44333324", 4, "Walk the old city walls above the Adriatic."],
        ["Split", "44334324", 4, "A Roman palace turned lively old town and island hub."],
        ["Plitvice Lakes", "01250304", 3, "Cascading turquoise lakes linked by boardwalks."],
      ] },

    // ---------- Central & Eastern Europe ----------
    { id: "cz", name: "Czechia", flag: "🇨🇿", region: "cee", lat: 49.8, lon: 15.5, cost: 2, best: [4, 5, 6, 9, 10, 12],
      temps: [1, 3, 8, 14, 19, 22, 24, 24, 19, 13, 6, 2], currency: "Koruna (CZK)", language: "Czech",
      blurb: "Gothic spires, beer halls and castle towns at friendly prices.",
      cities: [
        ["Prague", "05425133", 5, "Fairy-tale old town, castle views and beer halls."],
        ["Český Krumlov", "04331224", 3, "A riverside castle town straight out of a storybook."],
      ] },
    { id: "hu", name: "Hungary", flag: "🇭🇺", region: "cee", lat: 47.2, lon: 19.5, cost: 2, best: [4, 5, 6, 9, 10],
      temps: [2, 5, 11, 17, 22, 25, 27, 27, 22, 16, 8, 3], currency: "Forint (HUF)", language: "Hungarian",
      blurb: "Thermal baths, ruin bars and grand Danube architecture.",
      cities: [
        ["Budapest", "05425135", 4, "Thermal baths, ruin bars and Danube views."],
        ["Lake Balaton", "31333214", 2, "Central Europe's largest lake with wine and beaches.", [6, 7, 8]],
      ] },
    { id: "pl", name: "Poland", flag: "🇵🇱", region: "cee", lat: 51.9, lon: 19.1, cost: 2, best: [5, 6, 7, 8, 9],
      temps: [1, 3, 8, 14, 19, 22, 24, 24, 19, 13, 7, 2], currency: "Złoty (PLN)", language: "Polish",
      blurb: "Restored old towns, deep history and mountain hiking.",
      cities: [
        ["Kraków", "05424133", 4, "Grand market square, Jewish quarter and Wawel Castle."],
        ["Gdańsk", "24323133", 3, "Hanseatic port with amber shops and Baltic beaches."],
        ["Zakopane", "02352413", 2, "Tatra mountain base for hiking and skiing.", [1, 2, 6, 7, 8, 9]],
      ] },
    { id: "si", name: "Slovenia", flag: "🇸🇮", region: "cee", lat: 46.2, lon: 14.9, cost: 3, best: [5, 6, 7, 8, 9],
      temps: [3, 6, 11, 16, 21, 24, 27, 26, 21, 15, 8, 4], currency: "Euro (EUR)", language: "Slovene",
      blurb: "Alpine lakes, emerald rivers and a charming green capital.",
      cities: [
        ["Ljubljana", "03433224", 2, "Car-free riverside capital with great food markets."],
        ["Lake Bled", "02251415", 3, "Island church, castle views and rowing on the lake."],
      ] },

    // ---------- East Asia ----------
    { id: "jp", name: "Japan", flag: "🇯🇵", region: "eas", lat: 36.2, lon: 138.3, cost: 4, best: [3, 4, 5, 10, 11],
      temps: [10, 10, 14, 19, 23, 26, 30, 31, 27, 22, 17, 12], currency: "Yen (JPY)", language: "Japanese",
      blurb: "Neon cities, serene temples, cherry blossoms and exceptional food.",
      cities: [
        ["Tokyo", "05525252", 5, "Neon districts, sushi counters and quiet shrines."],
        ["Kyoto", "05532134", 5, "Temples, geisha districts and bamboo groves."],
        ["Osaka", "04515152", 4, "Street food capital with a famously fun nightlife."],
        ["Sapporo & Hokkaido", "02553523", 3, "Powder snow in winter and flower fields in summer.", [1, 2, 7, 8]],
      ] },
    { id: "kr", name: "South Korea", flag: "🇰🇷", region: "eas", lat: 35.9, lon: 127.8, cost: 3, best: [4, 5, 9, 10],
      temps: [2, 5, 11, 18, 23, 27, 29, 30, 26, 20, 12, 4], currency: "Won (KRW)", language: "Korean",
      blurb: "K-culture, palaces, barbecue and volcanic islands.",
      cities: [
        ["Seoul", "04525252", 4, "Palaces, K-pop, night markets and late-night barbecue."],
        ["Busan", "43534233", 3, "Beaches, seafood markets and hillside temples."],
        ["Jeju Island", "42452414", 3, "Volcanic craters, waterfalls and coastal trails."],
      ] },
    { id: "cn", name: "China", flag: "🇨🇳", region: "eas", lat: 35.9, lon: 104.2, cost: 2, best: [4, 5, 9, 10],
      temps: [2, 5, 13, 21, 27, 31, 31, 30, 26, 19, 10, 3], currency: "Yuan (CNY)", language: "Mandarin",
      blurb: "Imperial history, megacities and otherworldly karst landscapes.",
      cities: [
        ["Beijing", "05423241", 4, "The Forbidden City and the Great Wall."],
        ["Shanghai", "04515152", 4, "Art deco Bund, skyline views and soup dumplings."],
        ["Yangshuo", "02351414", 3, "Karst peaks, river rafting and cycling through rice paddies."],
      ] },
    { id: "tw", name: "Taiwan", flag: "🇹🇼", region: "eas", lat: 23.7, lon: 121, cost: 3, best: [3, 4, 10, 11],
      temps: [19, 20, 22, 26, 29, 32, 34, 33, 31, 27, 24, 21], currency: "Dollar (TWD)", language: "Mandarin",
      blurb: "Night markets, hot springs and marble gorges on a compact island.",
      cities: [
        ["Taipei", "04534242", 3, "Night markets, tea houses and hot springs."],
        ["Hualien & Taroko Gorge", "21351503", 2, "Marble canyons and dramatic Pacific coastline."],
      ] },

    // ---------- Southeast Asia ----------
    { id: "th", name: "Thailand", flag: "🇹🇭", region: "sea", lat: 15.9, lon: 100.9, cost: 1, best: [11, 12, 1, 2],
      temps: [32, 33, 34, 35, 34, 33, 33, 32, 32, 32, 32, 31], currency: "Baht (THB)", language: "Thai",
      blurb: "Golden temples, island beaches and some of the world's best street food.",
      cities: [
        ["Bangkok", "04515152", 5, "Temples, rooftop bars and legendary street food."],
        ["Chiang Mai", "04543334", 4, "Old city temples, night bazaars and jungle treks."],
        ["Phuket", "51434334", 5, "Beach resorts, island boat trips and lively nightlife."],
        ["Krabi", "51353515", 4, "Limestone cliffs, rock climbing and island hopping."],
      ] },
    { id: "vn", name: "Vietnam", flag: "🇻🇳", region: "sea", lat: 14.1, lon: 108.3, cost: 1, best: [2, 3, 4, 10, 11],
      temps: [23, 24, 27, 30, 32, 32, 32, 32, 31, 29, 27, 24], currency: "Dong (VND)", language: "Vietnamese",
      blurb: "Bustling cities, lantern-lit towns and dramatic bays.",
      cities: [
        ["Hanoi", "04524232", 4, "Old Quarter lanes, street food and French colonial cafés."],
        ["Hội An", "35522144", 4, "Lantern-lit old town, tailors and nearby beaches."],
        ["Hạ Long Bay", "21351404", 4, "Overnight cruises among limestone islands."],
        ["Ho Chi Minh City", "03515141", 4, "Motorbike energy, rooftop bars and war history."],
      ] },
    { id: "id", name: "Indonesia", flag: "🇮🇩", region: "sea", lat: -0.8, lon: 113.9, cost: 1, best: [5, 6, 7, 8, 9],
      temps: [31, 31, 31, 31, 31, 30, 29, 30, 31, 32, 32, 31], currency: "Rupiah (IDR)", language: "Indonesian",
      blurb: "Thousands of islands with temples, volcanoes, reefs and rice terraces.",
      cities: [
        ["Ubud, Bali", "25452335", 5, "Rice terraces, yoga retreats and Hindu temples."],
        ["Seminyak, Bali", "51425344", 4, "Beach clubs, surf and boutique shopping."],
        ["Yogyakarta", "05432333", 3, "Gateway to Borobudur and Prambanan temples."],
        ["Labuan Bajo", "40251503", 2, "Komodo dragons, pink beaches and world-class diving."],
      ] },
    { id: "ph", name: "Philippines", flag: "🇵🇭", region: "sea", lat: 12.9, lon: 121.8, cost: 1, best: [12, 1, 2, 3, 4],
      temps: [30, 31, 32, 34, 34, 32, 31, 31, 31, 31, 31, 30], currency: "Peso (PHP)", language: "Filipino, English",
      blurb: "Over 7,000 islands of lagoons, reefs and white-sand beaches.",
      cities: [
        ["El Nido, Palawan", "51252505", 3, "Hidden lagoons and limestone island-hopping."],
        ["Siargao", "51243504", 2, "Laid-back surf island with palm-lined roads."],
        ["Cebu", "42343433", 3, "Whale sharks, waterfalls and canyoneering."],
      ] },

    // ---------- South Asia ----------
    { id: "in", name: "India", flag: "🇮🇳", region: "sas", lat: 20.6, lon: 79, cost: 1, best: [10, 11, 12, 1, 2, 3],
      temps: [21, 24, 30, 36, 40, 39, 35, 33, 33, 32, 28, 23], currency: "Rupee (INR)", language: "Hindi, English",
      blurb: "Palaces, spices, festivals and astonishing diversity.",
      cities: [
        ["Jaipur", "05412252", 4, "The Pink City's forts, palaces and bazaars."],
        ["Agra", "05311131", 4, "Home of the Taj Mahal and Agra Fort."],
        ["Kerala Backwaters", "33451225", 3, "Houseboats, palm-lined canals and Ayurveda."],
        ["Goa", "52425324", 4, "Beach shacks, Portuguese churches and trance parties."],
        ["Varanasi", "05311122", 3, "Sacred ghats and riverside ceremonies on the Ganges."],
      ] },
    { id: "lk", name: "Sri Lanka", flag: "🇱🇰", region: "sas", lat: 7.9, lon: 80.8, cost: 1, best: [12, 1, 2, 3, 4],
      temps: [30, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30, 30], currency: "Rupee (LKR)", language: "Sinhala, Tamil",
      blurb: "Tea country, ancient cities, leopards and golden beaches.",
      cities: [
        ["Kandy", "05341223", 3, "Temple of the Tooth and gateway to tea country."],
        ["Ella", "02351414", 3, "Scenic train rides, tea estates and Nine Arch Bridge."],
        ["Galle", "44422234", 3, "Dutch colonial fort town near surf beaches."],
      ] },
    { id: "np", name: "Nepal", flag: "🇳🇵", region: "sas", lat: 28.4, lon: 84.1, cost: 1, best: [3, 4, 10, 11],
      temps: [19, 21, 25, 28, 29, 29, 28, 28, 28, 26, 23, 20], currency: "Rupee (NPR)", language: "Nepali",
      blurb: "Himalayan treks, Buddhist stupas and mountain villages.",
      cities: [
        ["Kathmandu", "05322241", 3, "Ancient temples, stupas and trekking supply shops."],
        ["Pokhara", "01352514", 3, "Lakeside base for Annapurna treks and paragliding."],
      ] },
    { id: "mv", name: "Maldives", flag: "🇲🇻", region: "sas", lat: 3.2, lon: 73.2, cost: 5, best: [12, 1, 2, 3, 4],
      temps: [30, 31, 31, 32, 31, 31, 30, 30, 30, 30, 30, 30], currency: "Rufiyaa (MVR)", language: "Dhivehi",
      blurb: "Overwater villas, reef snorkelling and total seclusion.",
      cities: [
        ["North Malé Atoll", "50341305", 4, "Easy-to-reach resort islands and surf breaks."],
        ["Baa Atoll", "50350405", 2, "UNESCO biosphere reserve with manta ray encounters."],
      ] },

    // ---------- Middle East & North Africa ----------
    { id: "ma", name: "Morocco", flag: "🇲🇦", region: "mena", lat: 31.8, lon: -7.1, cost: 2, best: [3, 4, 5, 10, 11],
      temps: [18, 20, 23, 25, 29, 33, 37, 37, 32, 27, 22, 19], currency: "Dirham (MAD)", language: "Arabic, French",
      blurb: "Labyrinthine medinas, Atlas mountains and Saharan dunes.",
      cities: [
        ["Marrakesh", "05523253", 5, "Souks, riads and the buzzing Jemaa el-Fnaa square."],
        ["Fes", "05411142", 3, "The world's largest car-free medina and ancient tanneries."],
        ["Chefchaouen", "03341324", 3, "The blue city in the Rif mountains."],
        ["Merzouga & the Sahara", "02250503", 3, "Camel treks and nights under desert stars."],
      ] },
    { id: "tr", name: "Turkey", flag: "🇹🇷", region: "mena", lat: 39, lon: 35.2, cost: 2, best: [4, 5, 6, 9, 10],
      temps: [9, 10, 12, 17, 22, 27, 29, 29, 25, 20, 15, 11], currency: "Lira (TRY)", language: "Turkish",
      blurb: "Where Europe meets Asia: bazaars, balloons and turquoise coast.",
      cities: [
        ["Istanbul", "15515152", 5, "Hagia Sophia, the Grand Bazaar and Bosphorus ferries."],
        ["Cappadocia", "04351424", 4, "Hot-air balloons over fairy chimneys and cave hotels."],
        ["Antalya", "53333334", 3, "Turquoise coast beaches and Roman ruins.", [5, 6, 9, 10]],
      ] },
    { id: "jo", name: "Jordan", flag: "🇯🇴", region: "mena", lat: 30.6, lon: 36.2, cost: 3, best: [3, 4, 5, 10, 11],
      temps: [13, 14, 18, 23, 28, 31, 32, 33, 31, 27, 20, 15], currency: "Dinar (JOD)", language: "Arabic",
      blurb: "Petra, desert camps and floating in the Dead Sea.",
      cities: [
        ["Petra", "05240412", 4, "The rose-red city carved into canyon walls."],
        ["Wadi Rum", "02251503", 3, "Martian desert landscapes and Bedouin camps."],
        ["Amman", "04413132", 2, "Roman theatre, citadel views and great mezze."],
      ] },
    { id: "ae", name: "United Arab Emirates", flag: "🇦🇪", region: "mena", lat: 23.4, lon: 53.8, cost: 4, best: [11, 12, 1, 2, 3],
      temps: [24, 26, 29, 34, 39, 41, 42, 42, 40, 36, 30, 26], currency: "Dirham (AED)", language: "Arabic",
      blurb: "Record-breaking skylines, desert safaris and luxury beaches.",
      cities: [
        ["Dubai", "42415353", 5, "Skyscrapers, mega-malls, beach clubs and desert safaris."],
        ["Abu Dhabi", "44413244", 3, "Grand mosque, Louvre Abu Dhabi and calm beaches."],
      ] },
    { id: "eg", name: "Egypt", flag: "🇪🇬", region: "mena", lat: 26.8, lon: 30.8, cost: 1, best: [10, 11, 12, 1, 2, 3],
      temps: [19, 21, 24, 28, 33, 35, 35, 35, 33, 30, 25, 20], currency: "Pound (EGP)", language: "Arabic",
      blurb: "Pyramids, Nile cruises and Red Sea diving.",
      cities: [
        ["Cairo", "05413141", 4, "The Pyramids of Giza and the Egyptian Museum."],
        ["Luxor", "05321223", 4, "Valley of the Kings and Karnak temple."],
        ["Dahab", "51342514", 2, "Laid-back Red Sea town famous for diving."],
      ] },

    // ---------- Sub-Saharan Africa ----------
    { id: "za", name: "South Africa", flag: "🇿🇦", region: "ssa", lat: -30.6, lon: 22.9, cost: 2, best: [2, 3, 4, 9, 10, 11],
      temps: [26, 27, 25, 23, 20, 18, 18, 18, 19, 21, 24, 25], currency: "Rand (ZAR)", language: "English and others",
      blurb: "Safari, winelands, coastal drives and a spectacular mother city.",
      cities: [
        ["Cape Town", "44554443", 5, "Table Mountain, penguins, winelands and beaches."],
        ["Greater Kruger", "01350503", 4, "Big Five safaris in private game reserves.", [5, 6, 7, 8, 9]],
        ["Garden Route", "41352414", 3, "Coastal road trip through forests and lagoons."],
      ] },
    { id: "ke", name: "Kenya", flag: "🇰🇪", region: "ssa", lat: -0.02, lon: 37.9, cost: 3, best: [1, 2, 7, 8, 9, 10],
      temps: [25, 27, 26, 24, 23, 22, 21, 22, 25, 25, 23, 24], currency: "Shilling (KES)", language: "Swahili, English",
      blurb: "The Great Migration, Maasai culture and Indian Ocean beaches.",
      cities: [
        ["Maasai Mara", "03250503", 4, "Classic savannah safari and the Great Migration.", [7, 8, 9, 10]],
        ["Nairobi", "03333231", 3, "Giraffe centre, national park and a lively food scene."],
        ["Diani Beach", "51332315", 2, "White sand, kitesurfing and coral reefs."],
      ] },
    { id: "tz", name: "Tanzania", flag: "🇹🇿", region: "ssa", lat: -6.4, lon: 34.9, cost: 3, best: [1, 2, 6, 7, 8, 9, 10],
      temps: [29, 29, 28, 25, 23, 22, 22, 23, 25, 27, 28, 28], currency: "Shilling (TZS)", language: "Swahili, English",
      blurb: "Serengeti plains, Kilimanjaro and the spice island of Zanzibar.",
      cities: [
        ["Serengeti", "02250503", 4, "Endless plains and year-round wildlife viewing."],
        ["Zanzibar", "54433335", 4, "Stone Town alleys, spice tours and dreamy beaches."],
        ["Moshi & Kilimanjaro", "01250501", 3, "Base camp for climbing Africa's highest peak."],
      ] },
    { id: "na", name: "Namibia", flag: "🇳🇦", region: "ssa", lat: -22.9, lon: 18.5, cost: 3, best: [5, 6, 7, 8, 9, 10],
      temps: [30, 28, 27, 25, 23, 20, 20, 23, 27, 29, 30, 31], currency: "Dollar (NAD)", language: "English",
      blurb: "Towering red dunes, desert wildlife and epic self-drive road trips.",
      cities: [
        ["Sossusvlei", "01150503", 3, "Climb some of the world's tallest sand dunes."],
        ["Etosha", "01250403", 3, "Salt-pan safari with waterhole wildlife spotting."],
        ["Swakopmund", "22342513", 2, "Sandboarding, quad biking and Atlantic fog."],
      ] },

    // ---------- North America ----------
    { id: "us", name: "United States", flag: "🇺🇸", region: "nam", lat: 39.8, lon: -98.6, cost: 4, best: [4, 5, 6, 9, 10],
      temps: [8, 10, 15, 20, 25, 29, 31, 30, 27, 21, 15, 10], currency: "Dollar (USD)", language: "English",
      blurb: "Iconic cities, legendary road trips and world-famous national parks.",
      cities: [
        ["New York City", "15525151", 5, "Broadway, world-class museums and every cuisine imaginable."],
        ["San Francisco", "24544242", 4, "Golden Gate views, sourdough and nearby redwoods."],
        ["New Orleans", "05515132", 4, "Jazz, Creole cooking and French Quarter balconies.", [2, 3, 4, 10, 11]],
        ["Utah National Parks", "01250503", 4, "Zion, Arches and Bryce canyon hikes.", [4, 5, 9, 10]],
        ["Maui, Hawaii", "52452525", 4, "Volcanic sunrises, snorkelling and the Road to Hana.", [4, 5, 6, 9, 10]],
      ] },
    { id: "ca", name: "Canada", flag: "🇨🇦", region: "nam", lat: 56.1, lon: -106.3, cost: 4, best: [6, 7, 8, 9],
      temps: [-2, 0, 5, 12, 19, 23, 26, 25, 20, 12, 5, 0], currency: "Dollar (CAD)", language: "English, French",
      blurb: "Rocky Mountain lakes, multicultural cities and wide-open wilderness.",
      cities: [
        ["Vancouver", "23553433", 4, "Mountains meet the ocean in a foodie city."],
        ["Banff", "01351524", 4, "Turquoise lakes and Rocky Mountain peaks.", [1, 2, 6, 7, 8, 9]],
        ["Montréal", "05525142", 3, "European charm, festivals and bagels."],
        ["Québec City", "05422133", 3, "Walled old city with a winter carnival.", [2, 6, 7, 8, 9, 12]],
      ] },
    { id: "mx", name: "Mexico", flag: "🇲🇽", region: "nam", lat: 23.6, lon: -102.5, cost: 2, best: [11, 12, 1, 2, 3, 4],
      temps: [24, 26, 28, 29, 30, 29, 28, 28, 27, 26, 25, 24], currency: "Peso (MXN)", language: "Spanish",
      blurb: "Ancient pyramids, cenotes, Caribbean coast and celebrated cuisine.",
      cities: [
        ["Mexico City", "05525252", 5, "Museums, taco stands and colourful neighbourhoods."],
        ["Oaxaca", "05532243", 3, "Mezcal, mole and indigenous craft markets."],
        ["Tulum", "54444425", 4, "Cliffside Maya ruins, cenotes and beach clubs."],
      ] },

    // ---------- Central America & Caribbean ----------
    { id: "cr", name: "Costa Rica", flag: "🇨🇷", region: "cac", lat: 9.7, lon: -83.8, cost: 3, best: [12, 1, 2, 3, 4],
      temps: [28, 29, 30, 30, 29, 28, 28, 28, 29, 28, 27, 27], currency: "Colón (CRC)", language: "Spanish",
      blurb: "Rainforests, volcanoes, sloths and eco-adventure.",
      cities: [
        ["Arenal & La Fortuna", "01251504", 3, "Volcano views, hot springs and ziplines."],
        ["Manuel Antonio", "50352414", 3, "Beaches inside a wildlife-filled national park."],
        ["Monteverde", "01250513", 2, "Cloud forest hanging bridges and night walks."],
      ] },
    { id: "gt", name: "Guatemala", flag: "🇬🇹", region: "cac", lat: 15.8, lon: -90.2, cost: 1, best: [11, 12, 1, 2, 3, 4],
      temps: [24, 25, 27, 27, 27, 25, 25, 25, 25, 24, 24, 24], currency: "Quetzal (GTQ)", language: "Spanish",
      blurb: "Colonial towns, volcano hikes and jungle-shrouded Maya cities.",
      cities: [
        ["Antigua", "05433343", 3, "Cobblestone colonial town ringed by volcanoes."],
        ["Lake Atitlán", "03352425", 3, "Volcano-rimmed lake with Maya villages."],
        ["Tikal", "05150402", 2, "Towering Maya temples rising above the jungle."],
      ] },
    { id: "cu", name: "Cuba", flag: "🇨🇺", region: "cac", lat: 21.5, lon: -77.8, cost: 2, best: [12, 1, 2, 3, 4],
      temps: [26, 27, 28, 29, 30, 31, 32, 32, 31, 29, 28, 27], currency: "Peso (CUP)", language: "Spanish",
      blurb: "Vintage cars, salsa, cigars and colonial streets.",
      cities: [
        ["Havana", "25315122", 4, "Classic cars, live music and crumbling grandeur."],
        ["Trinidad", "24333224", 2, "Pastel colonial town near beaches and waterfalls."],
        ["Viñales", "02351404", 2, "Tobacco farms and limestone valleys."],
      ] },
    { id: "jm", name: "Jamaica", flag: "🇯🇲", region: "cac", lat: 18.1, lon: -77.3, cost: 3, best: [12, 1, 2, 3, 4],
      temps: [30, 30, 30, 31, 31, 32, 32, 32, 32, 31, 31, 30], currency: "Dollar (JMD)", language: "English",
      blurb: "Reggae, jerk spices, waterfalls and long sandy beaches.",
      cities: [
        ["Negril", "51334315", 3, "Seven Mile Beach and cliff-jumping at sunset."],
        ["Ocho Rios", "42343424", 2, "Climb Dunn's River Falls and explore lush gardens."],
      ] },

    // ---------- South America ----------
    { id: "pe", name: "Peru", flag: "🇵🇪", region: "sam", lat: -9.2, lon: -75, cost: 2, best: [5, 6, 7, 8, 9],
      temps: [19, 19, 19, 20, 20, 20, 19, 20, 21, 21, 21, 20], currency: "Sol (PEN)", language: "Spanish, Quechua",
      blurb: "Machu Picchu, Andean culture and a world-leading food scene.",
      cities: [
        ["Cusco", "05443442", 4, "Inca stonework, colonial plazas and Sacred Valley trips."],
        ["Machu Picchu", "05250502", 5, "The legendary Inca citadel in the clouds."],
        ["Lima", "24514232", 3, "Ceviche, clifftop parks and top-rated restaurants.", [12, 1, 2, 3, 4]],
      ] },
    { id: "ar", name: "Argentina", flag: "🇦🇷", region: "sam", lat: -38.4, lon: -63.6, cost: 2, best: [3, 4, 5, 10, 11],
      temps: [30, 29, 26, 23, 19, 16, 15, 17, 19, 22, 25, 28], currency: "Peso (ARS)", language: "Spanish",
      blurb: "Tango, steak, Malbec and the wild landscapes of Patagonia.",
      cities: [
        ["Buenos Aires", "05515142", 4, "Tango halls, steakhouses and grand avenues."],
        ["Mendoza", "02542414", 3, "Malbec vineyards beneath the Andes."],
        ["El Chaltén, Patagonia", "00251503", 3, "Trekking capital beneath Mount Fitz Roy.", [11, 12, 1, 2, 3]],
        ["Iguazú Falls", "01250403", 3, "Hundreds of thundering waterfalls in the jungle."],
      ] },
    { id: "br", name: "Brazil", flag: "🇧🇷", region: "sam", lat: -14.2, lon: -51.9, cost: 2, best: [4, 5, 6, 8, 9, 10],
      temps: [30, 31, 30, 28, 26, 25, 25, 26, 26, 27, 28, 29], currency: "Real (BRL)", language: "Portuguese",
      blurb: "Carnival energy, Amazon rainforest and endless beaches.",
      cities: [
        ["Rio de Janeiro", "54445433", 5, "Sugarloaf, Copacabana and samba nights."],
        ["Salvador", "45524233", 3, "Afro-Brazilian culture and colourful colonial streets."],
        ["Florianópolis", "51344424", 2, "Island of 40 beaches, surf and lagoons.", [12, 1, 2, 3]],
      ] },
    { id: "co", name: "Colombia", flag: "🇨🇴", region: "sam", lat: 4.6, lon: -74.3, cost: 1, best: [12, 1, 2, 3, 7, 8],
      temps: [29, 29, 30, 30, 30, 30, 30, 30, 30, 29, 29, 29], currency: "Peso (COP)", language: "Spanish",
      blurb: "Caribbean colonial towns, coffee country and salsa-filled cities.",
      cities: [
        ["Cartagena", "45415233", 4, "Walled colonial city with Caribbean islands nearby."],
        ["Medellín", "03435332", 4, "Spring-like climate, cable cars and nightlife."],
        ["Salento & Coffee Region", "02351414", 2, "Wax palm valleys and coffee farm stays."],
      ] },
    { id: "cl", name: "Chile", flag: "🇨🇱", region: "sam", lat: -35.7, lon: -71.5, cost: 3, best: [10, 11, 12, 1, 2, 3],
      temps: [30, 30, 27, 23, 18, 15, 15, 17, 19, 23, 26, 29], currency: "Peso (CLP)", language: "Spanish",
      blurb: "Driest desert to southern glaciers, with wine valleys in between.",
      cities: [
        ["Santiago", "04434242", 3, "Andes backdrop, wine day trips and lively barrios."],
        ["San Pedro de Atacama", "02251503", 3, "Salt flats, geysers and incredible stargazing."],
        ["Torres del Paine", "00250502", 3, "Granite towers and the famous W Trek.", [11, 12, 1, 2, 3]],
      ] },

    // ---------- Oceania & Pacific ----------
    { id: "au", name: "Australia", flag: "🇦🇺", region: "oce", lat: -25.3, lon: 133.8, cost: 4, best: [3, 4, 5, 9, 10, 11],
      temps: [26, 26, 25, 23, 20, 17, 17, 18, 20, 22, 24, 25], currency: "Dollar (AUD)", language: "English",
      blurb: "Harbour cities, the Great Barrier Reef and the red outback.",
      cities: [
        ["Sydney", "54534343", 5, "Opera House, harbour ferries and Bondi beach."],
        ["Melbourne", "24525152", 4, "Laneway cafés, street art and sport culture."],
        ["Cairns & Great Barrier Reef", "41353514", 4, "Reef snorkelling and rainforest tours.", [6, 7, 8, 9, 10]],
        ["Uluru", "04150402", 3, "Sacred red monolith in the heart of the outback.", [5, 6, 7, 8, 9]],
      ] },
    { id: "nz", name: "New Zealand", flag: "🇳🇿", region: "oce", lat: -40.9, lon: 174.9, cost: 4, best: [11, 12, 1, 2, 3, 4],
      temps: [24, 24, 23, 21, 18, 16, 15, 15, 17, 18, 20, 22], currency: "Dollar (NZD)", language: "English, Māori",
      blurb: "Fjords, glaciers, geothermal wonders and adrenaline sports.",
      cities: [
        ["Queenstown", "01454523", 4, "Bungee, ski slopes and lakeside wine.", [1, 2, 3, 7, 8, 12]],
        ["Auckland", "33433342", 3, "Harbour city of volcanoes and island day trips."],
        ["Rotorua", "04341414", 3, "Geysers, mud pools and Māori culture."],
        ["Milford Sound", "00150403", 3, "Dramatic fjord cruises in Fiordland."],
      ] },
    { id: "fj", name: "Fiji", flag: "🇫🇯", region: "oce", lat: -17.7, lon: 178, cost: 3, best: [5, 6, 7, 8, 9, 10],
      temps: [31, 31, 31, 30, 29, 28, 27, 27, 28, 29, 30, 31], currency: "Dollar (FJD)", language: "English, Fijian",
      blurb: "Warm welcomes, coral reefs and palm-fringed island resorts.",
      cities: [
        ["Denarau & Nadi", "51322225", 3, "Easy resort base with day cruises to islands."],
        ["Yasawa Islands", "51251405", 2, "Remote beaches, village visits and snorkelling."],
      ] },
  ];

  // Starting points for distance estimates.
  const HOMES = [
    { id: "na-east", label: "US & Canada (East)", lat: 40, lon: -78 },
    { id: "na-west", label: "US & Canada (West)", lat: 38, lon: -120 },
    { id: "latam-n", label: "Mexico & Central America", lat: 17, lon: -95 },
    { id: "latam-s", label: "South America", lat: -20, lon: -55 },
    { id: "uk", label: "UK & Ireland", lat: 53, lon: -3 },
    { id: "eu-w", label: "Western Europe", lat: 48, lon: 6 },
    { id: "eu-e", label: "Eastern Europe", lat: 50, lon: 25 },
    { id: "me", label: "Middle East", lat: 26, lon: 45 },
    { id: "africa", label: "Africa", lat: 0, lon: 25 },
    { id: "s-asia", label: "South Asia", lat: 22, lon: 78 },
    { id: "e-asia", label: "East Asia", lat: 35, lon: 120 },
    { id: "se-asia", label: "Southeast Asia", lat: 5, lon: 105 },
    { id: "oceania", label: "Australia & New Zealand", lat: -33, lon: 150 },
  ];

  const data = { INTERESTS, REGIONS, COUNTRIES, HOMES };
  root.WTT_DATA = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);
