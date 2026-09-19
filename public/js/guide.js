// Unit guide screen: an encyclopedia of every structure / infantry / vehicle.
// Numbers (cost, hp, range, damage multipliers...) are read live from GA.DEFS / GA.WEAPONS / GA.MULT so they follow
// admin overrides; the explanatory text below is written per language (en / th).
(function () {
  'use strict';
  const GA = globalThis.GA;

  const L = {
    en: {
      what: 'What it is', use: 'What it is for', abilities: 'Abilities', tips: 'Tips & counters', stats: 'Stats', effect: 'Damage against',
      cost: 'Cost', time: 'Build time', hp: 'Hit points', speed: 'Speed', vision: 'Vision', power: 'Power', armor: 'Armor', builtAt: 'Built at', requires: 'Requires',
      damage: 'Damage', range: 'Range', rate: 'Fire rate', dps: 'Damage / sec', splash: 'Splash radius', targets: 'Targets', capacity: 'Ore capacity', unarmed: 'Unarmed',
      sec: 's', tps: 'tiles/s', tiles: 'tiles', none: 'None (starting building)', noBuild: 'Cannot be built',
      ground: 'Ground only', air: 'Air only', both: 'Ground & air',
      inf: 'Infantry', light: 'Light vehicles', heavy: 'Heavy armor', bld: 'Structures', air_: 'Aircraft',
      armorName: { inf: 'Infantry', light: 'Light', heavy: 'Heavy', bld: 'Structure', air: 'Aircraft' },
      immune: 'cannot hit', legend: 'Green = strong, red = weak. Numbers are damage multipliers.',
    },
    th: {
      what: 'คืออะไร', use: 'ใช้ทำอะไร', abilities: 'ความสามารถ', tips: 'เคล็ดลับและวิธีรับมือ', stats: 'ค่าสถานะ', effect: 'ความเสียหายต่อเป้าหมาย',
      cost: 'ราคา', time: 'เวลาสร้าง', hp: 'พลังชีวิต', speed: 'ความเร็ว', vision: 'ระยะมองเห็น', power: 'ไฟฟ้า', armor: 'เกราะ', builtAt: 'สร้างจาก', requires: 'ต้องมี',
      damage: 'ความเสียหาย', range: 'ระยะยิง', rate: 'ความถี่ยิง', dps: 'ความเสียหาย/วินาที', splash: 'รัศมีระเบิด', targets: 'เป้าหมาย', capacity: 'ความจุแร่', unarmed: 'ไม่มีอาวุธ',
      sec: 'วิ', tps: 'ช่อง/วิ', tiles: 'ช่อง', none: 'ไม่ต้องมี (อาคารตั้งต้น)', noBuild: 'สร้างเองไม่ได้',
      ground: 'พื้นดินเท่านั้น', air: 'อากาศเท่านั้น', both: 'พื้นดินและอากาศ',
      inf: 'ทหารราบ', light: 'ยานเบา', heavy: 'เกราะหนัก', bld: 'อาคาร', air_: 'อากาศยาน',
      armorName: { inf: 'ทหารราบ', light: 'เบา', heavy: 'หนัก', bld: 'อาคาร', air: 'อากาศยาน' },
      immune: 'ยิงไม่ได้', legend: 'สีเขียว = ได้เปรียบ, สีแดง = เสียเปรียบ ตัวเลขคือตัวคูณความเสียหาย',
    },
  };

  const G = {
    conyard: {
      en: {
        what: 'The heart of your base: the command hub every other structure is built from. It cannot be built directly - you start with one, and you get more by deploying a Mobile Nexus.',
        use: 'Lets you construct all other structures and defines where you can build - new buildings must be placed within a few tiles of an existing building.',
        abilities: ['Required to queue any structure', 'Large (3x3) and very sturdy', 'You are only eliminated when every building (and every Mobile Nexus) is gone'],
        tips: 'Without a Nexus Core you cannot build new structures, so keep a Mobile Nexus in reserve. Guard it against Breach Engineers - capturing it cripples a base.',
      },
      th: {
        what: 'หัวใจของฐานทัพ ศูนย์บัญชาการที่ใช้สร้างอาคารทุกชนิด สร้างเองตรงๆ ไม่ได้ คุณมีอยู่ 1 แห่งตอนเริ่มเกม และได้เพิ่มจากการตั้ง ยานตั้งฐานเคลื่อนที่',
        use: 'ทำให้คุณสั่งก่อสร้างอาคารอื่นๆ ได้ทั้งหมด และกำหนดพื้นที่ที่วางอาคารได้ - อาคารใหม่ต้องวางห่างจากอาคารเดิมไม่กี่ช่อง',
        abilities: ['จำเป็นสำหรับการสั่งสร้างอาคารทุกชนิด', 'ตัวใหญ่ (3x3) และทนทานมาก', 'คุณจะแพ้เมื่ออาคารทุกหลัง (และยานตั้งฐานทุกคัน) ถูกทำลาย'],
        tips: 'ถ้าไม่มีศูนย์บัญชาการจะสร้างอาคารใหม่ไม่ได้ จึงควรเก็บยานตั้งฐานเคลื่อนที่สำรองไว้ และระวังวิศวกรบุกยึดของศัตรู เพราะถ้าถูกยึดฐานจะพิการทันที',
      },
    },
    power: {
      en: {
        what: 'A compact fusion generator. It makes the electricity that everything else in your base runs on.',
        use: 'Keeps production at full speed and keeps power-hungry structures online.',
        abilities: ['Adds power to your base (see the Power stat)', 'Required before you can build an Ore Processor or Neural Barracks', 'When demand is higher than supply you get LOW POWER: production slows, Pulse Towers and the Sensor Array shut down, and the Orbital Uplink stops charging'],
        tips: 'Build another reactor before adding big consumers (Forge, Sensor Array, Quantum Lab, Uplink). Enemies love sniping reactors, so spread them out and defend them.',
      },
      th: {
        what: 'เครื่องผลิตไฟฟ้าฟิวชันขนาดกะทัดรัด ให้พลังงานที่ทุกอย่างในฐานต้องใช้',
        use: 'ทำให้การผลิตเดินเต็มสปีด และทำให้อาคารที่กินไฟทำงานได้',
        abilities: ['เพิ่มไฟฟ้าให้ฐาน (ดูค่า ไฟฟ้า)', 'ต้องมีก่อนจึงจะสร้างโรงกลั่นแร่และค่ายทหารนิวรัลได้', 'ถ้าใช้ไฟมากกว่าที่ผลิตจะเกิดภาวะไฟไม่พอ (LOW POWER): การผลิตช้าลง ป้อมพัลส์และระบบเรดาร์หยุดทำงาน และสถานีลิงก์วงโคจรหยุดชาร์จ'],
        tips: 'สร้างเครื่องปฏิกรณ์เพิ่มก่อนจะสร้างอาคารกินไฟหนักๆ (โรงงาน เรดาร์ ห้องวิจัย สถานีลิงก์) ศัตรูชอบโจมตีเครื่องปฏิกรณ์ ควรกระจายตำแหน่งและป้องกันให้ดี',
      },
    },
    refinery: {
      en: {
        what: 'The Ore Processor - the heart of your economy. Harvesters unload their ore here and it is converted into credits.',
        use: 'The only way to earn credits. Every credit you spend on buildings and units comes from ore refined here.',
        abilities: ['Comes with a FREE Nano Harvester the moment it is placed', 'Converts ore into credits quickly while a harvester unloads', 'Required before you can build an Assembly Forge or more Nano Harvesters', 'Extra processors shorten unloading queues and keep income flowing if one is destroyed'],
        tips: 'Place it close to the ore field so harvesters spend more time mining than driving. It is a prime raid target - keep a few defenders nearby.',
      },
      th: {
        what: 'โรงกลั่นแร่ ศูนย์กลางของเศรษฐกิจ รถเก็บแร่จะนำแร่มาส่งที่นี่แล้วแปลงเป็นเงิน',
        use: 'เป็นวิธีเดียวที่จะหาเงิน เงินทุกหน่วยที่ใช้สร้างอาคารและยูนิตมาจากแร่ที่กลั่นที่นี่',
        abilities: ['แถมรถเก็บแร่นาโนฟรี 1 คัน ทันทีที่วางเสร็จ', 'แปลงแร่เป็นเงินได้เร็วเมื่อรถเก็บแร่มาขนถ่าย', 'ต้องมีก่อนจึงจะสร้างโรงงานประกอบยานรบและรถเก็บแร่เพิ่มได้', 'สร้างเพิ่มเพื่อลดคิวขนถ่ายแร่ และรายได้ไม่ขาดถ้าหลังหนึ่งถูกทำลาย'],
        tips: 'วางใกล้ทุ่งแร่เพื่อให้รถเก็บแร่ใช้เวลาขุดมากกว่าขับ เป็นเป้าโจมตีสำคัญของศัตรู ควรมีกำลังป้องกันอยู่ใกล้ๆ',
      },
    },
    barracks: {
      en: {
        what: 'The infantry training centre. Foot soldiers are trained here.',
        use: 'Produces all infantry - cheap, quick to train and the backbone of your early army.',
        abilities: ['Trains Pulse Troopers, Rocket Lancers and Breach Engineers', 'Extra Barracks make the whole infantry queue train faster (the bonus stacks up to 3 extra) - they do not add a second queue', 'Select it and right-click the ground to set a rally point for new soldiers', 'Required before you can build a Pulse Tower'],
        tips: 'One Barracks is enough to start; add more once your economy is strong. Shift-click a unit card to queue 5 at once.',
      },
      th: {
        what: 'ศูนย์ฝึกทหารราบ ทหารทุกนายถูกฝึกที่นี่',
        use: 'ผลิตทหารราบทั้งหมด ราคาถูก ฝึกเร็ว และเป็นกำลังหลักในช่วงต้นเกม',
        abilities: ['ฝึกทหารพัลส์ พลจรวดแลนเซอร์ และวิศวกรบุกยึด', 'สร้างค่ายเพิ่มจะทำให้คิวทหารราบทั้งหมดผลิตเร็วขึ้น (โบนัสซ้อนได้สูงสุด 3 หลังเพิ่ม) ไม่ได้เพิ่มคิวที่สอง', 'เลือกค่ายแล้วคลิกขวาที่พื้นเพื่อกำหนดจุดรวมพลให้ทหารที่ผลิตใหม่', 'ต้องมีก่อนจึงจะสร้างป้อมพัลส์ได้'],
        tips: 'เริ่มต้นหลังเดียวก็พอ ค่อยเพิ่มเมื่อเศรษฐกิจแข็งแรงแล้ว กด Shift+คลิกที่การ์ดยูนิตเพื่อต่อคิวทีละ 5',
      },
    },
    factory: {
      en: {
        what: 'The Assembly Forge - your vehicle plant.',
        use: 'Builds every vehicle: harvesters, hovers, tanks, artillery, drones, walkers and the Mobile Nexus.',
        abilities: ['Builds the Nano Harvester, Vector Hover and Arc Tank straight away; advanced vehicles need a Sensor Array or Quantum Lab', 'Extra Forges make the vehicle queue faster (bonus stacks up to 3 extra)', 'Select it and right-click the ground to set a rally point', 'Required before you can build a Sensor Array'],
        tips: 'Nothing heavy rolls out without it, so protect it. A second Forge is one of the best investments once income is stable.',
      },
      th: {
        what: 'โรงงานประกอบยานรบ โรงงานผลิตยานพาหนะของคุณ',
        use: 'สร้างยานพาหนะทุกชนิด: รถเก็บแร่ โฮเวอร์ รถถัง ปืนใหญ่ โดรน หุ่นเดิน และยานตั้งฐานเคลื่อนที่',
        abilities: ['สร้างรถเก็บแร่นาโน โฮเวอร์เวกเตอร์ และรถถังอาร์กได้ทันที ส่วนยานขั้นสูงต้องมีระบบเรดาร์หรือห้องวิจัยควอนตัม', 'สร้างโรงงานเพิ่มจะทำให้คิวยานพาหนะเร็วขึ้น (โบนัสซ้อนได้สูงสุด 3 หลังเพิ่ม)', 'เลือกโรงงานแล้วคลิกขวาที่พื้นเพื่อกำหนดจุดรวมพล', 'ต้องมีก่อนจึงจะสร้างระบบเรดาร์เซ็นเซอร์ได้'],
        tips: 'ไม่มีโรงงานก็ไม่มียานรบ ต้องปกป้องให้ดี เมื่อรายได้มั่นคงแล้ว โรงงานหลังที่สองคือการลงทุนที่คุ้มมาก',
      },
    },
    radar: {
      en: {
        what: 'The Sensor Array - long-range scanners and your tactical eyes.',
        use: 'Gives you the minimap and unlocks the advanced war machines.',
        abilities: ['Switches on the minimap (needs power)', 'Unlocks Nova Mortar, Wasp Drone and Mobile Nexus', 'Very wide vision around the building', 'Required before you can build a Quantum Lab'],
        tips: 'It goes dark during LOW POWER - and so does your minimap - so keep the reactors healthy.',
      },
      th: {
        what: 'ระบบเรดาร์เซ็นเซอร์ เครื่องสแกนระยะไกล ดวงตาเชิงยุทธวิธีของคุณ',
        use: 'ให้คุณมีมินิแมพ และปลดล็อกเครื่องจักรสงครามขั้นสูง',
        abilities: ['เปิดใช้มินิแมพ (ต้องมีไฟฟ้า)', 'ปลดล็อกปืนครกโนวา โดรนแตนบิน และยานตั้งฐานเคลื่อนที่', 'มองเห็นได้กว้างมากรอบตัวอาคาร', 'ต้องมีก่อนจึงจะสร้างห้องวิจัยควอนตัมได้'],
        tips: 'เมื่อไฟไม่พอ เรดาร์จะดับและมินิแมพจะหายไปด้วย จึงควรดูแลเครื่องปฏิกรณ์ให้ดี',
      },
    },
    techlab: {
      en: {
        what: 'The Quantum Lab - the research facility for elite technology.',
        use: 'Unlocks the strongest units and the superweapon.',
        abilities: ['Unlocks Rail Striker and Titan Walker', 'Unlocks the Orbital Uplink superweapon', 'Requires a Sensor Array'],
        tips: 'Costly and power-hungry. Build it when you have spare power and a strong economy - and defend it, since it is the key to your late game.',
      },
      th: {
        what: 'ห้องวิจัยควอนตัม ศูนย์วิจัยเทคโนโลยีระดับสูงสุด',
        use: 'ปลดล็อกยูนิตที่แข็งแกร่งที่สุดและอาวุธวินาศ',
        abilities: ['ปลดล็อกรถถังเรลกันและหุ่นยักษ์ไททัน', 'ปลดล็อกสถานีลิงก์วงโคจร (อาวุธวินาศ)', 'ต้องมีระบบเรดาร์เซ็นเซอร์ก่อน'],
        tips: 'ราคาแพงและกินไฟมาก สร้างเมื่อมีไฟสำรองและเศรษฐกิจดีแล้ว และควรป้องกันให้ดีเพราะเป็นกุญแจของช่วงท้ายเกม',
      },
    },
    turret: {
      en: {
        what: 'The Pulse Tower - a small automated defence turret.',
        use: 'Static defence that guards approaches, ore fields and weak flanks so your army does not have to.',
        abilities: ['Shoots both ground and air targets', 'Fast-firing and effective against every armor type', 'Only works while you have power - it goes offline in LOW POWER', 'Tiny (1x1), so it can be placed in clusters'],
        tips: 'It cannot move, and artillery such as the Nova Mortar outranges it. Support towers with your own army and keep power up.',
      },
      th: {
        what: 'ป้อมพัลส์ ป้อมปืนอัตโนมัติขนาดเล็ก',
        use: 'ป้องกันจุดสำคัญ ทางเข้าฐาน ทุ่งแร่ และปีกที่อ่อนแอ โดยไม่ต้องใช้กองทัพประจำการ',
        abilities: ['ยิงได้ทั้งพื้นดินและอากาศ', 'ยิงเร็วและใช้ได้ผลกับเกราะทุกชนิด', 'ทำงานได้เมื่อมีไฟฟ้าเท่านั้น ถ้าไฟไม่พอจะหยุดทำงาน', 'ขนาดเล็ก (1x1) วางเรียงกันเป็นกลุ่มได้'],
        tips: 'มันเคลื่อนที่ไม่ได้ และปืนใหญ่อย่างปืนครกโนวายิงไกลกว่า ควรให้กองทัพช่วยคุ้มกันป้อมและรักษาไฟให้พอ',
      },
    },
    uplink: {
      en: {
        what: 'The Orbital Uplink - a satellite link that fires a superweapon, the Orbital Lance.',
        use: 'Lets you strike anywhere on the map with devastating damage - break a fortified base or wipe out an army ball.',
        abilities: ['Charges over time as long as you have power (progress shows in the sidebar)', 'When READY, click the button and then a target; the beam lands after a short delay', 'Huge damage in a blast area - strongest in the centre, weaker toward the edge', 'The launch is announced to every player', 'Destroying the Uplink resets the charge; it stops charging in LOW POWER'],
        tips: 'The Lance hits EVERYTHING in the area, including your own units and buildings - aim carefully. Fast units can escape during the delay, so target buildings and slow, clumped armies.',
      },
      th: {
        what: 'สถานีลิงก์วงโคจร ดาวเทียมเชื่อมต่อที่ยิงอาวุธวินาศ ลำแสงวงโคจร',
        use: 'ให้คุณโจมตีได้ทุกจุดบนแผนที่ด้วยความเสียหายมหาศาล ทลายฐานที่มีการป้องกันแน่นหนาหรือกวาดกองทัพศัตรู',
        abilities: ['ชาร์จเรื่อยๆ ตราบใดที่มีไฟฟ้า (ดูความคืบหน้าที่แถบด้านข้าง)', 'เมื่อพร้อม (READY) กดปุ่มแล้วเลือกเป้าหมาย ลำแสงจะตกลงมาหลังหน่วงเวลาสั้นๆ', 'ความเสียหายมหาศาลเป็นวง แรงสุดตรงกลาง ลดลงเมื่อไปทางขอบ', 'ทุกคนในเกมจะได้รับแจ้งเมื่อมีการยิง', 'ถ้าสถานีถูกทำลาย การชาร์จจะรีเซ็ต และจะไม่ชาร์จเมื่อไฟไม่พอ'],
        tips: 'ลำแสงโดนทุกอย่างในพื้นที่ รวมถึงยูนิตและอาคารของคุณเอง เล็งให้ดี ยูนิตเร็วหนีทันในช่วงหน่วงเวลา จึงควรเล็งอาคารหรือกองทัพช้าๆ ที่รวมกลุ่มกัน',
      },
    },

    trooper: {
      en: {
        what: 'Basic foot soldier armed with a pulse rifle.',
        use: 'The cheap, quick-to-train backbone of any early army, and a cost-effective answer to enemy infantry.',
        abilities: ['Attacks ground and air targets', 'Very effective against infantry', 'Weak against heavy armor and buildings'],
        tips: 'Mass them early and pair them with Rocket Lancers for armor. Tanks and artillery splash will chew through clumps of them.',
      },
      th: {
        what: 'ทหารราบพื้นฐานติดปืนพัลส์',
        use: 'กำลังหลักราคาถูกฝึกเร็วของช่วงต้นเกม และเป็นทางเลือกที่คุ้มค่าเมื่อเจอทหารราบศัตรู',
        abilities: ['ยิงได้ทั้งพื้นดินและอากาศ', 'ได้ผลดีมากกับทหารราบ', 'อ่อนต่อเกราะหนักและอาคาร'],
        tips: 'ผลิตเป็นจำนวนมากตั้งแต่ต้นและจับคู่กับพลจรวดแลนเซอร์เพื่อรับมือรถเกราะ ระวังรถถังและปืนใหญ่ที่ยิงเป็นวงกวาดทหารที่กระจุกกัน',
      },
    },
    lancer: {
      en: {
        what: 'Infantry carrying a shoulder-mounted rocket launcher.',
        use: 'Your cheap anti-armor and anti-air specialist.',
        abilities: ['Rockets hit ground and air targets, with a small blast', 'Long range for an infantry unit', 'Strong against vehicles and aircraft, weak against infantry'],
        tips: 'Keep them behind Pulse Troopers. They are your best answer to Wasp Drones and heavy tanks such as the Titan Walker.',
      },
      th: {
        what: 'ทหารราบที่แบกเครื่องยิงจรวดบนบ่า',
        use: 'ผู้เชี่ยวชาญต่อต้านเกราะและต่อต้านอากาศยานราคาประหยัด',
        abilities: ['จรวดโจมตีได้ทั้งพื้นดินและอากาศ และระเบิดเป็นวงเล็กๆ', 'ระยะยิงไกลสำหรับทหารราบ', 'ได้เปรียบต่อรถและอากาศยาน เสียเปรียบต่อทหารราบ'],
        tips: 'ให้ยืนอยู่หลังทหารพัลส์ เป็นตัวแก้ทางที่ดีที่สุดของโดรนแตนบินและรถหนักอย่างหุ่นยักษ์ไททัน',
      },
    },
    engineer: {
      en: {
        what: 'An unarmed technician trained to seize enemy buildings.',
        use: 'Steals enemy structures instead of destroying them - turn their own base against them.',
        abilities: ['Right-click an enemy building: the Engineer walks up and captures it on arrival', 'The building becomes yours, and it counts toward your tech tree', 'Works on any enemy structure, including production buildings, towers and the Nexus Core', 'Consumed in the process'],
        tips: 'Very fragile and unarmed, so escort them and clear defenders first. Capturing an Ore Processor steals income; capturing a tower turns it on its owner.',
      },
      th: {
        what: 'ช่างเทคนิคไม่มีอาวุธ ผู้ผ่านการฝึกมาเพื่อยึดอาคารศัตรู',
        use: 'ยึดอาคารศัตรูแทนที่จะทำลาย เปลี่ยนฐานของศัตรูให้กลับมาสู้กับเจ้าของเอง',
        abilities: ['คลิกขวาที่อาคารศัตรู วิศวกรจะเดินไปและยึดเมื่อไปถึง', 'อาคารจะกลายเป็นของคุณ และนับรวมในสายเทคโนโลยีของคุณ', 'ยึดได้ทุกอาคารของศัตรู ทั้งอาคารผลิต ป้อม และศูนย์บัญชาการ', 'วิศวกรจะถูกใช้หมดไปเมื่อยึดสำเร็จ'],
        tips: 'เปราะบางและไม่มีอาวุธ ต้องมีกำลังคุ้มกันและกำจัดตัวป้องกันก่อน ยึดโรงกลั่นแร่เพื่อแย่งรายได้ ยึดป้อมเพื่อหันปากกระบอกกลับไปยิงเจ้าของเดิม',
      },
    },

    harvester: {
      en: {
        what: 'A heavy ore-mining vehicle with nano-drills.',
        use: 'Feeds your economy: it mines ore crystals and hauls them to an Ore Processor.',
        abilities: ['Fully automatic: finds ore, mines, and returns to the nearest processor to unload', 'Carries a large load before returning (see Ore capacity)', 'Right-click an ore tile to send it to a specific field; press Stop (S) to return it to automatic', 'Unarmed but tough (heavy armor)'],
        tips: 'Lose your harvesters and your income stops. Keep the army near the ore field, and consider a second harvester early on.',
      },
      th: {
        what: 'ยานเก็บแร่หนักติดสว่านนาโน',
        use: 'ขับเคลื่อนเศรษฐกิจของคุณ ขุดคริสตัลแร่แล้วขนไปส่งที่โรงกลั่นแร่',
        abilities: ['ทำงานอัตโนมัติ หาแร่ ขุด และกลับมาส่งที่โรงกลั่นแร่ที่ใกล้ที่สุด', 'บรรทุกได้มากก่อนกลับ (ดู ความจุแร่)', 'คลิกขวาที่ช่องแร่เพื่อส่งไปขุดจุดที่ต้องการ กด Stop (S) เพื่อให้กลับไปทำงานอัตโนมัติ', 'ไม่มีอาวุธแต่ทนทาน (เกราะหนัก)'],
        tips: 'ถ้าเสียรถเก็บแร่ รายได้จะหยุดทันที ควรให้กองทัพอยู่ใกล้ทุ่งแร่ และพิจารณาสร้างคันที่สองแต่เนิ่นๆ',
      },
    },
    hover: {
      en: {
        what: 'A light, very fast hovering raider.',
        use: 'Scouting, raiding enemy harvesters and hunting infantry.',
        abilities: ['Much faster than ground tanks', 'Shoots ground and air targets', 'Weak against heavy armor and buildings', 'Fragile - low hit points'],
        tips: 'Hit-and-run their harvesters. Avoid tanks and towers, which shred it quickly.',
      },
      th: {
        what: 'ยานโฮเวอร์เบาที่เร็วมาก เหมาะกับการบุกโจมตีเร็ว',
        use: 'สอดแนม โจมตีรถเก็บแร่ศัตรู และไล่ล่าทหารราบ',
        abilities: ['เร็วกว่ารถถังบนพื้นมาก', 'ยิงได้ทั้งพื้นดินและอากาศ', 'อ่อนต่อเกราะหนักและอาคาร', 'เปราะบาง พลังชีวิตน้อย'],
        tips: 'ใช้โจมตีแล้วถอยใส่รถเก็บแร่ของศัตรู หลีกเลี่ยงรถถังและป้อมที่จะกำจัดมันได้อย่างรวดเร็ว',
      },
    },
    arc: {
      en: {
        what: 'The main battle tank, armed with a plasma cannon.',
        use: 'The all-round workhorse of your ground army.',
        abilities: ['Plasma shells burst into a blast area', 'Good against infantry, vehicles and buildings alike', 'Sturdy heavy armor', 'Cannot shoot aircraft'],
        tips: 'Bring Rocket Lancers, Pulse Troopers or towers for anti-air cover. Rail Strikers and Lancers are its natural counters.',
      },
      th: {
        what: 'รถถังหลัก ติดปืนใหญ่พลาสมา',
        use: 'กำลังหลักอเนกประสงค์ของกองทัพภาคพื้นดิน',
        abilities: ['กระสุนพลาสมาระเบิดเป็นวง', 'ใช้ได้ดีทั้งกับทหารราบ ยานพาหนะ และอาคาร', 'เกราะหนักทนทาน', 'ยิงอากาศยานไม่ได้'],
        tips: 'ให้พลจรวดแลนเซอร์ ทหารพัลส์ หรือป้อมคอยคุ้มกันต่ออากาศ ตัวที่ปราบมันได้ดีคือรถถังเรลกันและพลจรวด',
      },
    },
    nova: {
      en: {
        what: 'Long-range self-propelled artillery.',
        use: 'Bombards enemy bases and defences from far outside their range.',
        abilities: ['Outranges every other weapon, including Pulse Towers', 'Shells explode in a large blast area', 'Best against buildings and infantry; weaker against heavy armor', 'Huge vision for its own targeting', 'Ground targets only'],
        tips: 'Extremely fragile and slow to reload. Keep it behind your tanks, and beware of fast Hovers or Wasp Drones diving on it.',
      },
      th: {
        what: 'ปืนใหญ่เคลื่อนที่ระยะไกล',
        use: 'ถล่มฐานและแนวป้องกันของศัตรูจากระยะไกลที่พวกเขาตอบโต้ไม่ได้',
        abilities: ['ยิงไกลกว่าอาวุธอื่นทุกชนิด รวมถึงป้อมพัลส์', 'กระสุนระเบิดเป็นวงกว้าง', 'เก่งกับอาคารและทหารราบ อ่อนกับเกราะหนัก', 'มองเห็นได้ไกลมากสำหรับการเล็ง', 'ยิงได้เฉพาะเป้าหมายบนพื้น'],
        tips: 'เปราะบางมากและบรรจุกระสุนช้า ให้อยู่หลังรถถังและระวังโฮเวอร์หรือโดรนแตนบินที่พุ่งเข้าใส่',
      },
    },
    wasp: {
      en: {
        what: 'A small flying attack drone.',
        use: 'Fast air raider that ignores terrain - perfect for hitting harvesters and reaching bases that ground armies cannot.',
        abilities: ['Flies over water, cliffs and walls', 'One of the fastest units in the game', 'Attacks ground targets only - it cannot shoot other aircraft', 'Only anti-air can hit it: Rocket Lancers, Pulse Troopers, Vector Hovers and Pulse Towers'],
        tips: 'Excellent on island maps like Sunken Isles. Most tanks cannot shoot back, but keep it away from Lancers and towers.',
      },
      th: {
        what: 'โดรนโจมตีบินขนาดเล็ก',
        use: 'ยานโจมตีทางอากาศที่เร็วและไม่สนใจภูมิประเทศ เหมาะกับการตีรถเก็บแร่และเข้าถึงฐานที่กองทัพภาคพื้นดินไปไม่ถึง',
        abilities: ['บินข้ามน้ำ หน้าผา และกำแพง', 'เป็นหนึ่งในยูนิตที่เร็วที่สุดในเกม', 'โจมตีได้เฉพาะเป้าหมายบนพื้น ยิงอากาศยานด้วยกันไม่ได้', 'มีเพียงอาวุธต่อต้านอากาศเท่านั้นที่ยิงมันได้: พลจรวดแลนเซอร์ ทหารพัลส์ โฮเวอร์เวกเตอร์ และป้อมพัลส์'],
        tips: 'เหมาะมากกับแผนที่เกาะอย่างเกาะจมน้ำ รถถังส่วนใหญ่ยิงสวนไม่ได้ แต่ควรอยู่ให้ห่างพลจรวดและป้อม',
      },
    },
    rail: {
      en: {
        what: 'A tank built around a heavy railgun.',
        use: 'Your armor-killer: deletes enemy tanks and walkers.',
        abilities: ['Instant-hit beam, no travel time', 'Huge damage per shot, but slow to fire', 'Excellent against heavy armor and vehicles', 'Poor against infantry; ground targets only', 'Long vision'],
        tips: 'Wasteful against crowds of infantry, so screen it with Pulse Troopers. Requires a Quantum Lab.',
      },
      th: {
        what: 'รถถังที่สร้างรอบปืนรางเรลกันขนาดหนัก',
        use: 'ตัวสังหารเกราะของคุณ กำจัดรถถังและหุ่นเดินของศัตรู',
        abilities: ['ลำแสงถึงเป้าทันที ไม่มีเวลากระสุนเดินทาง', 'ความเสียหายต่อนัดสูงมาก แต่ยิงช้า', 'ยอดเยี่ยมกับเกราะหนักและยานพาหนะ', 'อ่อนต่อทหารราบ และยิงได้เฉพาะเป้าหมายบนพื้น', 'มองเห็นได้ไกล'],
        tips: 'ไม่คุ้มเมื่อต้องยิงใส่ทหารราบเป็นฝูง ควรมีทหารพัลส์คุ้มกัน ต้องมีห้องวิจัยควอนตัม',
      },
    },
    titan: {
      en: {
        what: 'A towering heavy assault walker.',
        use: 'The tip of the spear: leads the push and soaks up enormous damage while it flattens defences.',
        abilities: ['The toughest unit you can build', 'Rapid-fire plasma with splash damage', 'Slowest unit in the game', 'Ground targets only'],
        tips: 'It cannot shoot aircraft, so bring anti-air with it. Rail Strikers and massed Rocket Lancers are its best counters. Requires a Quantum Lab.',
      },
      th: {
        what: 'หุ่นเดินโจมตีหนักขนาดยักษ์',
        use: 'หัวหอกของกองทัพ นำการบุกและรับความเสียหายมหาศาลขณะทลายแนวป้องกัน',
        abilities: ['ยูนิตที่ทนที่สุดที่คุณสร้างได้', 'พลาสมายิงถี่ ความเสียหายเป็นวง', 'เป็นยูนิตที่ช้าที่สุดในเกม', 'ยิงได้เฉพาะเป้าหมายบนพื้น'],
        tips: 'ยิงอากาศยานไม่ได้ ต้องมีหน่วยต่อต้านอากาศไปด้วย ตัวปราบที่ดีคือรถถังเรลกันและพลจรวดแลนเซอร์จำนวนมาก ต้องมีห้องวิจัยควอนตัม',
      },
    },
    mcv: {
      en: {
        what: 'The Mobile Nexus - a Nexus Core packed onto a heavy chassis.',
        use: 'Lets you found a new base on another ore field, or rebuild after yours has fallen.',
        abilities: ['Unarmed', 'Select it and press D (or the Deploy button) to unpack into a Nexus Core on clear ground', 'Also keeps you in the game: you are not eliminated while you own one', 'Expand toward a richer ore field or a forward position'],
        tips: 'Expensive and defenceless - escort it while travelling. Keep one in reserve as insurance.',
      },
      th: {
        what: 'ยานตั้งฐานเคลื่อนที่ ศูนย์บัญชาการที่ติดตั้งบนแชสซีหนัก',
        use: 'ตั้งฐานใหม่ในทุ่งแร่แห่งอื่น หรือสร้างฐานขึ้นใหม่หลังจากฐานเดิมพังไปแล้ว',
        abilities: ['ไม่มีอาวุธ', 'เลือกแล้วกด D (หรือปุ่ม Deploy) เพื่อกางเป็นศูนย์บัญชาการบนพื้นที่โล่ง', 'ช่วยให้คุณยังไม่แพ้ ตราบใดที่ยังมีมันอยู่ก็ไม่ถูกคัดออก', 'ขยายไปยังทุ่งแร่ที่อุดมกว่าหรือตำแหน่งแนวหน้า'],
        tips: 'ราคาแพงและป้องกันตัวเองไม่ได้ ต้องมีกำลังคุ้มกันระหว่างเดินทาง และควรเก็บไว้หนึ่งคันเป็นประกัน',
      },
    },
  };

  const ARMORS = ['inf', 'light', 'heavy', 'bld', 'air'];
  const TABS = ['structure', 'infantry', 'vehicle'];
  const state = { tab: 'structure', sel: null };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const trim = (n) => String(Math.round(n * 10) / 10);
  const nameOf = (t) => GA.tt(GA.DEFS[t].name);

  function iconCanvas(type, css) {
    const c = el('canvas', 'gicon');
    c.width = 152; c.height = 112;
    c.style.width = css[0] + 'px'; c.style.height = css[1] + 'px';
    try { c.getContext('2d').drawImage(GA.getIcon(type, 0), 0, 0); } catch (e) { /* icon is decorative */ }
    return c;
  }

  function statTiles(type, T) {
    const d = GA.DEFS[type], out = [];
    const add = (label, value, cls) => out.push([label, value, cls]);
    add(T.cost, '◈ ' + d.cost.toLocaleString('en-US'));
    if (d.time) add(T.time, d.time + ' ' + T.sec);
    add(T.hp, d.hp.toLocaleString('en-US'));
    if (d.kind === 'u') add(T.speed, trim(d.speed) + ' ' + T.tps);
    add(T.vision, trim(d.vision) + ' ' + T.tiles);
    if (d.kind === 'b') add(T.power, d.power > 0 ? '+' + d.power : d.power < 0 ? '−' + Math.abs(d.power) : '0', d.power > 0 ? 'good' : d.power < 0 ? 'bad' : '');
    add(T.armor, T.armorName[d.armor] || d.armor);
    if (d.harvester) add(T.capacity, d.capacity);
    const wp = d.weapon ? GA.WEAPONS[d.weapon] : null;
    if (wp) {
      add(T.damage, trim(wp.dmg));
      add(T.range, trim(wp.range) + ' ' + T.tiles);
      add(T.rate, trim(wp.cd) + ' ' + T.sec);
      add(T.dps, trim(wp.dmg / wp.cd));
      if (wp.splash) add(T.splash, trim(wp.splash) + ' ' + T.tiles);
      add(T.targets, T[wp.targets] || wp.targets);
    } else if (d.kind === 'u') {
      add(T.damage, T.unarmed, 'dim');
    }
    return out;
  }

  function requiresText(type, T) {
    const d = GA.DEFS[type];
    if (d.buildable === false) return T.noBuild;
    const parts = (d.req || []).map(nameOf);
    return parts.length ? parts.join(', ') : T.none;
  }

  function builtAt(type) {
    const d = GA.DEFS[type];
    if (d.buildable === false) return null;
    const host = d.cat === 'infantry' ? 'barracks' : d.cat === 'vehicle' ? 'factory' : 'conyard';
    return nameOf(host);
  }

  function effectiveness(type, T) {
    const d = GA.DEFS[type], wp = d.weapon ? GA.WEAPONS[d.weapon] : null;
    if (!wp || !GA.MULT[wp.wtype]) return null;
    const box = el('div', 'geff');
    for (const ar of ARMORS) {
      let m = GA.MULT[wp.wtype][ar];
      if (ar === 'air' ? wp.targets === 'ground' : wp.targets === 'air') m = 0;
      const chip = el('div', 'gchip ' + (m <= 0 ? 'no' : m >= 1.1 ? 'good' : m <= 0.5 ? 'bad' : 'mid'));
      chip.appendChild(el('small', null, ar === 'air' ? T.air_ : T[ar]));
      chip.appendChild(el('b', null, m <= 0 ? '✕' : '×' + trim(m)));
      chip.title = m <= 0 ? T.immune : '';
      box.appendChild(chip);
    }
    return box;
  }

  function section(title, node) {
    const s = el('div', 'gsec');
    s.appendChild(el('h4', null, title));
    s.appendChild(node);
    return s;
  }

  function renderDetail(host, type) {
    const lang = GA.lang === 'th' ? 'th' : 'en', T = L[lang], d = GA.DEFS[type];
    const info = (G[type] || {})[lang] || (G[type] || {}).en || null;
    host.innerHTML = '';

    const head = el('div', 'ghead');
    head.appendChild(iconCanvas(type, [114, 84]));
    const title = el('div', 'gtitle');
    title.appendChild(el('h3', null, GA.tt(d.name)));
    title.appendChild(el('p', 'muted', GA.tt(d.desc)));
    const meta = el('div', 'gmeta');
    meta.appendChild(el('span', null, GA.tt(GA.CAT_LABEL[d.cat])));
    const at = builtAt(type);
    meta.appendChild(el('span', null, at ? T.builtAt + ': ' + at : T.noBuild));
    title.appendChild(meta);
    head.appendChild(title);
    host.appendChild(head);

    const tiles = el('div', 'gtiles');
    for (const [label, value, cls] of statTiles(type, T)) {
      const t = el('div', 'gtile' + (cls ? ' ' + cls : ''));
      t.appendChild(el('small', null, label));
      t.appendChild(el('b', null, value));
      tiles.appendChild(t);
    }
    const rq = el('div', 'gtile wide');
    rq.appendChild(el('small', null, T.requires));
    rq.appendChild(el('b', null, requiresText(type, T)));
    tiles.appendChild(rq);
    host.appendChild(tiles);

    const eff = effectiveness(type, T);
    if (eff) {
      const wrap = section(T.effect, eff);
      wrap.appendChild(el('p', 'gnote', T.legend));
      host.appendChild(wrap);
    }

    if (info) {
      host.appendChild(section(T.what, el('p', null, info.what)));
      host.appendChild(section(T.use, el('p', null, info.use)));
      const ul = el('ul');
      for (const a of info.abilities) ul.appendChild(el('li', null, a));
      host.appendChild(section(T.abilities, ul));
      host.appendChild(section(T.tips, el('p', null, info.tips)));
    }
  }

  function renderThumbs(host, detail) {
    host.innerHTML = '';
    const types = GA.TYPES.filter((t) => GA.DEFS[t].cat === state.tab);
    if (!types.includes(state.sel)) state.sel = types[0];
    for (const t of types) {
      const b = el('button', 'gthumb' + (t === state.sel ? ' on' : ''));
      b.type = 'button';
      b.appendChild(iconCanvas(t, [76, 56]));
      b.appendChild(el('span', null, GA.tt(GA.DEFS[t].name)));
      b.onclick = () => { state.sel = t; renderThumbs(host, detail); renderDetail(detail, t); };
      host.appendChild(b);
    }
    renderDetail(detail, state.sel);
  }

  GA.renderGuide = function () {
    const tabs = document.getElementById('guideTabs'), thumbs = document.getElementById('guideThumbs'), detail = document.getElementById('guideDetail');
    if (!tabs || !thumbs || !detail) return;
    tabs.innerHTML = '';
    for (const c of TABS) {
      const b = el('button', state.tab === c ? 'active' : '', GA.tt(GA.CAT_LABEL[c]));
      b.type = 'button';
      b.onclick = () => {
        state.tab = c;
        for (const x of tabs.children) x.classList.remove('active');
        b.classList.add('active');
        renderThumbs(thumbs, detail);
        detail.scrollTop = 0;
      };
      tabs.appendChild(b);
    }
    renderThumbs(thumbs, detail);
  };
})();
