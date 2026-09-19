// Language support (English / Thai).
// English strings are the keys. In Thai mode a MutationObserver translates every text node / title / placeholder that
// appears in the page (static HTML, JS-built UI, server messages) from the dictionary below or from the patterns.
(function () {
  'use strict';
  const GA = (globalThis.GA = globalThis.GA || {});

  let lang = 'en';
  try {
    const saved = localStorage.getItem('ga.lang');
    lang = saved === 'th' || saved === 'en' ? saved : /^th/i.test(navigator.language || '') ? 'th' : 'en';
  } catch (e) { /* ignore */ }
  GA.lang = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;

  GA.setLang = function (l) {
    try { localStorage.setItem('ga.lang', l); } catch (e) { /* ignore */ }
    location.reload();
  };

  // ---------------------------------------------------------------------------- dictionary (English -> Thai)
  const TH = {
    // ---- generic / menus
    'Build a base. Harvest ore. Dominate the grid.': 'สร้างฐาน เก็บแร่ ครองสนามรบ',
    'Sign in': 'เข้าสู่ระบบ', 'Register': 'สมัครสมาชิก', 'Username': 'ชื่อผู้ใช้', 'Password': 'รหัสผ่าน', 'Confirm password': 'ยืนยันรหัสผ่าน',
    'Create account': 'สร้างบัญชี', 'The first account registered on this server becomes the admin.': 'บัญชีแรกที่สมัครบนเซิร์ฟเวอร์นี้จะเป็นแอดมิน',
    'Passwords do not match': 'รหัสผ่านไม่ตรงกัน', 'You are the first user - you have admin rights.': 'คุณเป็นผู้ใช้คนแรก - ได้สิทธิ์แอดมิน',
    'COMMANDER': 'ผู้บัญชาการ', 'ADMIN': 'แอดมิน', 'RATING': 'เรตติ้ง', 'admin': 'แอดมิน', 'user': 'ผู้ใช้',
    '⚔ Find match': '⚔ ค้นหาแมตช์', '(ranked)': '(จัดอันดับ)', '▶ Skirmish vs AI': '▶ เล่นกับบอท', '🌐 Online lobby': '🌐 ล็อบบี้ออนไลน์', '(custom rooms)': '(ห้องกำหนดเอง)',
    '📊 Stats': '📊 สถิติ', 'How to play': 'วิธีเล่น', '⚙ Admin panel': '⚙ หน้าแอดมิน', 'Sign out': 'ออกจากระบบ', '← Back': '← กลับ',
    'Find a match': 'ค้นหาแมตช์', 'YOUR RATING': 'เรตติ้งของคุณ',
    'Ranked free-for-all for up to 3 players. You are matched with commanders of a similar rating (the search widens the longer you wait). Your placement decides the rating change.':
      'แมตช์จัดอันดับแบบทุกคนเป็นศัตรู สูงสุด 3 คน ระบบจะจับคู่กับผู้บัญชาการที่เรตติ้งใกล้เคียง (ยิ่งรอนานยิ่งค้นหากว้างขึ้น) เรตติ้งจะเปลี่ยนตามอันดับที่คุณได้',
    'Fill with AI opponents if nobody is found (unranked)': 'เติมบอทเป็นคู่ต่อสู้ถ้าหาคนไม่เจอ (ไม่นับอันดับ)',
    '⚔ Start searching': '⚔ เริ่มค้นหา', 'Searching…': 'กำลังค้นหา…', 'Searching for opponents…': 'กำลังค้นหาคู่ต่อสู้…', 'Cancel': 'ยกเลิก', 'MATCH FOUND': 'พบแมตช์แล้ว!',
    'Cannot reach the game server.': 'เชื่อมต่อเซิร์ฟเวอร์เกมไม่ได้', 'Connecting…': 'กำลังเชื่อมต่อ…',
    'Stats': 'สถิติ', 'Recent matches': 'แมตช์ล่าสุด', 'Leaderboard': 'ลีดเดอร์บอร์ด', 'Sign-in history': 'ประวัติการเข้าสู่ระบบ',
    'Skirmish': 'เล่นกับบอท', 'Opponents': 'จำนวนบอทคู่ต่อสู้', '1 AI': 'บอท 1 ตัว', '2 AI': 'บอท 2 ตัว', 'AI 1 difficulty': 'ความยากบอท 1', 'AI 2 difficulty': 'ความยากบอท 2',
    'Easy': 'ง่าย', 'Normal': 'ปกติ', 'Hard': 'ยาก', 'easy': 'ง่าย', 'normal': 'ปกติ', 'hard': 'ยาก', 'Teams': 'ทีม', 'Free for all': 'ทุกคนเป็นศัตรู',
    'You + AI 1 vs AI 2': 'คุณ + บอท 1 สู้ บอท 2', 'You vs AI 1 + AI 2 (allied)': 'คุณ สู้ บอท 1 + บอท 2 (บอทเป็นพันธมิตรกัน)',
    'Starting credits': 'เงินเริ่มต้น', 'Game speed': 'ความเร็วเกม', 'Fast': 'เร็ว', 'Very fast': 'เร็วมาก', 'Your colour': 'สีของคุณ', 'Map': 'แผนที่',
    'Start game': 'เริ่มเกม', '(default)': '(ค่าเริ่มต้น)',
    'Online lobby': 'ล็อบบี้ออนไลน์', 'commander(s) online': 'ผู้บัญชาการออนไลน์', 'CODE': 'รหัส', 'Join': 'เข้าร่วม', '＋ Create room': '＋ สร้างห้อง',
    'Chat with everyone in the lobby…': 'พูดคุยกับทุกคนในล็อบบี้…', 'Chat…': 'พิมพ์ข้อความ…',
    'No open rooms yet. Create one and invite your friends - empty slots are filled with AI.': 'ยังไม่มีห้อง สร้างห้องแล้วชวนเพื่อนได้เลย - ช่องที่ว่างจะถูกเติมด้วยบอท',
    'Open': 'เปิดรับ', 'Full': 'เต็ม', 'In game': 'กำลังเล่น',
    'Enter the 4-letter room code': 'ใส่รหัสห้อง 4 ตัวอักษร', 'Connection lost. Go back and re-enter the lobby.': 'การเชื่อมต่อขาด กลับไปแล้วเข้าล็อบบี้ใหม่อีกครั้ง',
    'Disconnected from server': 'ขาดการเชื่อมต่อกับเซิร์ฟเวอร์', 'Room closed': 'ห้องถูกปิด',
    'Room': 'ห้อง', 'ROOM CODE': 'รหัสห้อง', 'Copy invite link': 'คัดลอกลิงก์เชิญ', 'Copied!': 'คัดลอกแล้ว!', 'Empty slots at start': 'ช่องว่างตอนเริ่มเกม',
    'AI Easy': 'บอท ง่าย', 'AI Normal': 'บอท ปกติ', 'AI Hard': 'บอท ยาก', '← Leave room': '← ออกจากห้อง',
    'You are the host. Pick who plays in each slot and choose colours, then start.': 'คุณเป็นเจ้าของห้อง เลือกผู้เล่นในแต่ละช่อง เลือกสี แล้วกดเริ่มเกม',
    'Waiting for the host to start the game…': 'รอเจ้าของห้องเริ่มเกม…', 'Waiting for player… (AI fills in)': 'รอผู้เล่น… (บอทจะเติมให้)', 'Closed': 'ปิด',
    'Open (friend / AI)': 'เปิด (เพื่อน / บอท)', 'Open (AI if empty)': 'เปิด (ถ้าว่างใช้บอท)', 'Waiting for the host…': 'รอเจ้าของห้อง…',
    'Friends on your Wi-Fi / LAN can open:': 'เพื่อนในวง Wi-Fi / LAN เดียวกันเปิดที่:', 'Share this link:': 'ส่งลิงก์นี้ให้เพื่อน:',
    'Cyan': 'ฟ้า', 'Crimson': 'แดง', 'Lime': 'เขียวมะนาว', 'Amber': 'เหลืองอำพัน', 'Violet': 'ม่วง', 'Orange': 'ส้ม', 'Pink': 'ชมพู', 'Blue': 'น้ำเงิน',
    'and join room': 'แล้วเข้าห้อง', '(none)': '(ไม่มี)', 'Class \\ Armor': 'ประเภท \\ เกราะ',
    'first account - admin': 'บัญชีแรก - แอดมิน', 'admin bootstrapped from environment': 'สร้างแอดมินจากค่า environment', 'wrong password': 'รหัสผ่านผิด', 'unknown user': 'ไม่มีชื่อผู้ใช้นี้',
    'username taken': 'ชื่อผู้ใช้ถูกใช้แล้ว', 'rate limited': 'ถูกจำกัดความถี่', 'older connection closed': 'ปิดการเชื่อมต่อเก่า',
    // ---- help
    'Economy': 'เศรษฐกิจ', 'Base & army': 'ฐานและกองทัพ', 'Controls': 'ปุ่มควบคุม', 'Tips': 'เคล็ดลับ',
    '📖 Unit guide': '📖 คู่มืออาคารและยูนิต', 'Unit guide': 'คู่มืออาคารและยูนิต',
    'Every structure, soldier and machine: what it is, what it is for, and what it can do.': 'อาคาร ทหาร และเครื่องจักรทุกชนิด: คืออะไร ใช้ทำอะไร และทำอะไรได้บ้าง',
    // ---- HUD
    'RADAR OFFLINE': 'เรดาร์ไม่ทำงาน', 'Build a Sensor Array': 'สร้างระบบเรดาร์เซ็นเซอร์', '(needs power)': '(ต้องมีไฟฟ้า)',
    '🔧 Repair': '🔧 ซ่อม', '$ Sell': '$ ขาย', 'POWER': 'ไฟฟ้า',
    'Sound effects & announcer': 'เสียงเอฟเฟกต์และผู้ประกาศ', 'Music': 'เพลง', 'Menu (Esc)': 'เมนู (Esc)', 'Say something… (Enter)': 'พิมพ์ข้อความ… (Enter)',
    'Structures': 'อาคาร', 'Infantry': 'ทหารราบ', 'Vehicles': 'ยานพาหนะ',
    'READY': 'พร้อม', 'ON HOLD': 'พักไว้', 'NEED ◈': 'เงินไม่พอ', 'Queued': 'ในคิว',
    'ORBITAL LANCE': 'ลำแสงวงโคจร', 'READY - click to fire': 'พร้อม - คลิกเพื่อยิง', 'LOW POWER': 'ไฟไม่พอ', 'Choose a target': 'เลือกเป้าหมาย',
    '■ Stop (S)': '■ หยุด (S)', '⚔ Attack-move (A)': '⚔ เคลื่อนที่-โจมตี (A)', '⬢ Deploy (D)': '⬢ ตั้งฐาน (D)', '🔧 Repair (R)': '🔧 ซ่อม (R)', '🔧 Repairing…': '🔧 กำลังซ่อม…',
    'Right-click the ground to set a rally point.': 'คลิกขวาที่พื้นเพื่อกำหนดจุดรวมพล',
    'Menu': 'เมนู', 'Resume': 'เล่นต่อ', 'Leave game': 'ออกจากเกม', 'Game paused': 'หยุดเกมชั่วคราว', 'Online game keeps running': 'เกมออนไลน์ยังคงดำเนินต่อไป',
    'VICTORY': 'ชัยชนะ', 'DEFEAT': 'พ่ายแพ้', 'All enemy forces have been eliminated.': 'ทำลายกองกำลังศัตรูทั้งหมดแล้ว', 'Your base has fallen.': 'ฐานของคุณถูกทำลาย',
    'Time': 'เวลา', 'Kills': 'สังหาร', 'Losses': 'สูญเสีย', 'Built': 'สร้าง', 'Keep watching': 'ดูต่อ', 'Leave': 'ออก',
    'RANKED': 'จัดอันดับ', 'CASUAL': 'ทั่วไป', 'place {p} of {n}': 'อันดับ {p} จาก {n}', 'rating': 'เรตติ้ง', '{n} win streak': 'ชนะติดต่อกัน {n} เกม',
    'Build a Fusion Reactor first, then a Refinery.  RMB = move / attack · A = attack-move · H = home': 'สร้างเครื่องปฏิกรณ์ฟิวชันก่อน แล้วตามด้วยโรงกลั่นแร่  คลิกขวา = เดิน/โจมตี · A = เดินโจมตี · H = กลับฐาน',
    'Structure ready to place': 'อาคารพร้อมวางแล้ว', 'Cannot build here.': 'สร้างตรงนี้ไม่ได้', 'Cannot deploy here.': 'ตั้งฐานตรงนี้ไม่ได้',
    'Low power! Production slowed, defenses offline.': 'ไฟไม่พอ! การผลิตช้าลง ป้อมปืนหยุดทำงาน', 'Orbital Lance is ready!': 'ลำแสงวงโคจรพร้อมยิงแล้ว!',
    'Base under attack': 'ฐานถูกโจมตี', '⚠ Base under attack': '⚠ ฐานถูกโจมตี', 'Nexus Core deployed.': 'ตั้งศูนย์บัญชาการเน็กซัสแล้ว', 'Orbital Lance launched!': 'ยิงลำแสงวงโคจรแล้ว!',
    // ---- announcer
    'Construction complete': 'สร้างเสร็จแล้ว', 'Unit ready': 'ยูนิตพร้อม', 'Low power': 'ไฟไม่พอ', 'Orbital lance ready': 'ลำแสงวงโคจรพร้อม',
    'Mission accomplished': 'ภารกิจสำเร็จ', 'You have been defeated': 'คุณพ่ายแพ้แล้ว',
    // ---- stats
    'Result': 'ผล', 'Place': 'อันดับ', 'Mode': 'โหมด', 'K / L': 'ฆ่า / เสีย', 'Length': 'ความยาว', 'Versus': 'คู่ต่อสู้','When': 'เมื่อ', 'WIN': 'ชนะ', 'LOSS': 'แพ้', 'QUIT': 'ออกกลางคัน',
    'ranked': 'จัดอันดับ', 'custom': 'ห้องกำหนดเอง', 'matchmaking': 'จับคู่',
    '#': '#', 'Commander': 'ผู้บัญชาการ', 'Peak': 'สูงสุด', 'Ranked': 'จัดอันดับ', 'Games': 'เกม', 'Win %': 'ชนะ %',
    'Event': 'เหตุการณ์', 'IP address': 'IP', 'Device': 'อุปกรณ์', 'Note': 'หมายเหตุ',
    'Failed sign-in': 'เข้าสู่ระบบไม่สำเร็จ', 'Signed in': 'เข้าสู่ระบบ', 'Account created': 'สร้างบัญชี',
    'No online matches yet. Play a ranked match or a custom room game!': 'ยังไม่มีแมตช์ออนไลน์ ลองเล่นแมตช์จัดอันดับหรือห้องกำหนดเองดู!',
    'The leaderboard is empty - play a ranked match to get on it.': 'ลีดเดอร์บอร์ดยังว่างอยู่ - เล่นแมตช์จัดอันดับเพื่อขึ้นอันดับ',
    "Don't recognise an entry? Ask an admin to reset your password. Failed attempts against your account are listed here too.": 'ไม่รู้จักรายการไหน? ให้แอดมินรีเซ็ตรหัสผ่านให้ ความพยายามเข้าสู่ระบบที่ผิดพลาดกับบัญชีของคุณจะแสดงที่นี่ด้วย',
    'Loading…': 'กำลังโหลด…', 'Rating': 'เรตติ้ง', 'Rank': 'อันดับ', 'Win rate': 'อัตราชนะ', 'Kill / loss': 'ฆ่า / เสีย', 'Play time': 'เวลาเล่น', 'vs AI (offline)': 'เล่นกับบอท (ออฟไลน์)',
    'structures & units': 'อาคารและยูนิต', 'no ranked games': 'ยังไม่มีเกมจัดอันดับ',
    // ---- maps
    'Triad Crossing': 'ทางสามแพร่ง', 'Sunken Isles': 'เกาะจมน้ำ', 'Iron Highlands': 'ที่ราบสูงเหล็ก', 'Wildlands': 'ดินแดนสุ่ม',
    'Symmetric open field. Rock spokes with gates split the bases, a walled centre holds the richest ore.': 'สนามเปิดแบบสมมาตร กำแพงหินมีประตูแบ่งฐาน ใจกลางมีกำแพงล้อมและแร่ที่อุดมที่สุด',
    'Island bases joined by narrow land bridges over deep water. Air power and bridge control decide the game.': 'ฐานอยู่บนเกาะ เชื่อมกันด้วยสะพานดินแคบๆ เหนือน้ำลึก กองทัพอากาศและการคุมสะพานเป็นตัวตัดสิน',
    'Winding cliff lines and canyons. Ambush country with long detours.': 'แนวหน้าผาและหุบเขาคดเคี้ยว เหมาะกับการซุ่มโจมตี ต้องอ้อมไกล',
    'A brand new random battlefield every game.': 'สนามรบสุ่มใหม่ทุกเกม',
    // ---- unit / building names & descriptions
    'Nexus Core': 'ศูนย์บัญชาการเน็กซัส', 'Command hub. Expands your build area.': 'ศูนย์บัญชาการ ขยายพื้นที่ก่อสร้าง',
    'Fusion Reactor': 'เครื่องปฏิกรณ์ฟิวชัน', 'Generates power (+150).': 'ผลิตไฟฟ้า (+150)',
    'Ore Processor': 'โรงกลั่นแร่', 'Converts ore to credits. Comes with a free Nano Harvester.': 'แปลงแร่เป็นเงิน แถมรถเก็บแร่นาโนฟรี 1 คัน',
    'Neural Barracks': 'ค่ายทหารนิวรัล', 'Trains infantry.': 'ฝึกทหารราบ',
    'Assembly Forge': 'โรงงานประกอบยานรบ', 'Builds vehicles and drones.': 'สร้างยานพาหนะและโดรน',
    'Sensor Array': 'ระบบเรดาร์เซ็นเซอร์', 'Enables minimap. Unlocks advanced units.': 'เปิดใช้มินิแมพ ปลดล็อกยูนิตขั้นสูง',
    'Quantum Lab': 'ห้องวิจัยควอนตัม', 'Unlocks elite tech and the Orbital Uplink.': 'ปลดล็อกเทคสูงสุดและสถานีลิงก์วงโคจร',
    'Pulse Tower': 'ป้อมพัลส์', 'Defensive tower. Hits ground and air. Needs power.': 'ป้อมป้องกัน ยิงได้ทั้งพื้นดินและอากาศ ต้องใช้ไฟฟ้า',
    'Orbital Uplink': 'สถานีลิงก์วงโคจร', 'Superweapon: calls down an Orbital Lance.': 'อาวุธวินาศ: เรียกลำแสงวงโคจรลงมา',
    'Pulse Trooper': 'ทหารพัลส์', 'Cheap all-round infantry.': 'ทหารราบราคาถูก ใช้ได้ทุกสถานการณ์',
    'Rocket Lancer': 'พลจรวดแลนเซอร์', 'Anti-armor and anti-air rockets.': 'จรวดต่อต้านเกราะและต่อต้านอากาศยาน',
    'Breach Engineer': 'วิศวกรบุกยึด', 'Captures enemy buildings.': 'ยึดอาคารของศัตรู',
    'Nano Harvester': 'รถเก็บแร่นาโน', 'Collects ore automatically.': 'เก็บแร่อัตโนมัติ',
    'Vector Hover': 'โฮเวอร์เวกเตอร์', 'Fast raider.': 'ยานโจมตีเร็ว',
    'Arc Tank': 'รถถังอาร์ก', 'Main battle tank.': 'รถถังหลัก',
    'Nova Mortar': 'ปืนครกโนวา', 'Long-range artillery. Splash damage.': 'ปืนใหญ่ระยะไกล สร้างความเสียหายเป็นวง',
    'Wasp Drone': 'โดรนแตนบิน', 'Flying raider. Ignores terrain.': 'ยานโจมตีทางอากาศ ไม่สนใจภูมิประเทศ',
    'Rail Striker': 'รถถังเรลกัน', 'Piercing railgun. Deadly vs armor.': 'ปืนรางทะลุเกราะ ร้ายแรงต่อยานเกราะหนา',
    'Titan Walker': 'หุ่นยักษ์ไททัน', 'Heavy assault walker.': 'หุ่นเดินโจมตีหนัก',
    'Mobile Nexus': 'ยานตั้งฐานเคลื่อนที่', 'Deploys into a new Nexus Core.': 'ตั้งเป็นศูนย์บัญชาการเน็กซัสใหม่',
    'Crystal Derrick': 'แท่นขุดคริสตัล', 'Neutral tech site. Capture it to earn credits every second.': 'จุดเทคเป็นกลาง ยึดไว้เพื่อรับเงินทุกวินาที',
    'Supply Depot': 'คลังเสบียง', 'Neutral supply cache. Capture it for a one-time cash bonus.': 'คลังเสบียงเป็นกลาง ยึดเพื่อรับโบนัสเงินครั้งเดียว',
    'Neutral structure: capture it with a Breach Engineer, or destroy it.': 'อาคารเป็นกลาง: ยึดด้วยวิศวกรบุกยึด หรือยิงทำลาย', 'Neutral': 'เป็นกลาง',
    'Income (credits/s when owned)': 'รายได้ (เงิน/วินาที เมื่อยึดได้)', 'Capture bonus (credits)': 'โบนัสเมื่อยึด (เงิน)', 'Rock wall hit points': 'พลังชีวิตกำแพงหิน', 'Splash damage to rocks (fraction)': 'สเปลชที่ทำลายหิน (สัดส่วน)',
    // ---- misc labels
    'ground': 'พื้นดิน', 'air': 'อากาศ', 'both': 'ทั้งสอง', 'inf': 'ทหารราบ', 'light': 'เบา', 'heavy': 'หนัก', 'bld': 'อาคาร',
    // ---- server / sim messages
    'Session expired - please sign in again': 'เซสชันหมดอายุ - กรุณาเข้าสู่ระบบใหม่', 'You signed in from another window': 'คุณเข้าสู่ระบบจากอีกหน้าต่างหนึ่ง',
    'Not signed in': 'ยังไม่ได้เข้าสู่ระบบ', 'Room not found': 'ไม่พบห้อง', 'Room is full': 'ห้องเต็มแล้ว', 'Game already started': 'เกมเริ่มไปแล้ว', 'Room not available': 'ห้องนี้ไม่เปิดให้เข้า',
    'That colour is already taken': 'สีนี้มีคนใช้แล้ว', 'Need at least 2 players': 'ต้องมีผู้เล่นอย่างน้อย 2 คน', 'All players are on the same team': 'ผู้เล่นทุกคนอยู่ทีมเดียวกัน',
    'Leave your room before searching for a match': 'ออกจากห้องก่อนค้นหาแมตช์', 'Closed by an admin': 'ห้องถูกแอดมินปิด', 'Your account was removed': 'บัญชีของคุณถูกลบ',
    'Username must be 3-16 characters: letters, numbers, _ or -': 'ชื่อผู้ใช้ต้องยาว 3-16 ตัว ใช้ได้เฉพาะตัวอักษร ตัวเลข _ หรือ -', 'Password must be 6-64 characters': 'รหัสผ่านต้องยาว 6-64 ตัวอักษร',
    'That username is already taken': 'ชื่อผู้ใช้นี้ถูกใช้แล้ว', 'Too many attempts. Try again in a few minutes.': 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', 'Wrong username or password': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    // ---- admin page
    // ---- map editor
    'Maps': 'แผนที่', 'Map editor: build a battlefield for 2 or 3 players. Maps you save appear in the map picker for Skirmish and online rooms. The outer edge is always indestructible rock; rock inside the map can be destroyed in-game.':
      'ตัวแก้ไขแผนที่: สร้างสนามรบสำหรับ 2 หรือ 3 ผู้เล่น แผนที่ที่บันทึกจะไปอยู่ในตัวเลือกแผนที่ของโหมดเล่นกับบอทและห้องออนไลน์ หินขอบนอกสุดทำลายไม่ได้เสมอ ส่วนหินภายในแผนที่ทำลายได้ในเกม',
    'New map': 'แผนที่ใหม่', 'Editing': 'กำลังแก้ไข', 'Map name': 'ชื่อแผนที่', 'Short description': 'คำอธิบายสั้นๆ', 'Save': 'บันทึก', 'Save as new copy': 'บันทึกเป็นสำเนาใหม่', '＋ New map': '＋ แผนที่ใหม่',
    'Tools': 'เครื่องมือ', '⬜ Open ground': '⬜ พื้นโล่ง', '▦ Rock wall': '▦ กำแพงหิน', '≈ Water': '≈ น้ำ', '◈ Ore': '◈ แร่', '⌫ Erase ore': '⌫ ลบแร่', '⚑ Start position': '⚑ จุดเริ่มต้น',
    'D Crystal Derrick': 'D แท่นขุดคริสตัล', 'S Supply Depot': 'S คลังเสบียง', '✕ Remove object': '✕ ลบวัตถุ',
    'Brush size': 'ขนาดแปรง', 'Brush shape': 'รูปทรงแปรง', 'Round': 'กลม', 'Square': 'สี่เหลี่ยม', 'Ore richness': 'ความอุดมของแร่', 'Poor (400)': 'น้อย (400)', 'Normal (700)': 'ปกติ (700)', 'Rich (1100)': 'มาก (1100)',
    'Start position to place': 'จุดเริ่มต้นที่จะวาง', 'Start 1 (cyan)': 'จุดเริ่ม 1 (ฟ้า)', 'Start 2 (red)': 'จุดเริ่ม 2 (แดง)', 'Start 3 (lime)': 'จุดเริ่ม 3 (เขียว)',
    'Bucket fill (open / rock / water)': 'เทสี (พื้น / หิน / น้ำ)', 'Show grid': 'แสดงตาราง',
    'Left mouse paints with the selected tool, right mouse paints open ground / removes. Placing a start position clears open ground around it.': 'เมาส์ซ้ายวาดด้วยเครื่องมือที่เลือก เมาส์ขวาวาดพื้นโล่ง / ลบ การวางจุดเริ่มต้นจะเปิดพื้นที่โล่งรอบจุดนั้นให้อัตโนมัติ',
    'Symmetry': 'สมมาตร', 'Off': 'ปิด', 'Rotate x3 (3 bases)': 'หมุน x3 (3 ฐาน)', 'Mirror left / right': 'กระจกซ้าย / ขวา', 'Mirror top / bottom': 'กระจกบน / ล่าง', 'Mirror both': 'กระจกทั้งสองแกน',
    '↶ Undo': '↶ เลิกทำ', '↷ Redo': '↷ ทำซ้ำ', 'Start from a template': 'เริ่มจากเทมเพลต', 'Blank map': 'แผนที่ว่าง', 'Wildlands (random)': 'ดินแดนสุ่ม (random)', 'Seed': 'ค่าสุ่ม', 'Load template': 'โหลดเทมเพลต',
    'Checks': 'ตรวจสอบ', 'Saved maps': 'แผนที่ที่บันทึกไว้', 'Edit': 'แก้ไข', 'No custom maps yet. Build one above and press Save.': 'ยังไม่มีแผนที่ที่สร้างเอง สร้างด้านบนแล้วกดบันทึก',
    'Rock': 'หิน', 'Water': 'น้ำ', 'Open ground': 'พื้นโล่ง', 'ore': 'แร่', 'start positions': 'จุดเริ่มต้น', 'neutral structures': 'อาคารเป็นกลาง',
    'Looks good - ready to save.': 'ไม่พบปัญหา - พร้อมบันทึก', 'Map deleted.': 'ลบแผนที่แล้ว', 'Map loaded.': 'โหลดแผนที่แล้ว', 'Template loaded.': 'โหลดเทมเพลตแล้ว',
    'Saved. Everyone can pick it in Skirmish and in online rooms.': 'บันทึกแล้ว ทุกคนเลือกเล่นได้ในโหมดเล่นกับบอทและห้องออนไลน์', 'Discard the unsaved changes?': 'ทิ้งการเปลี่ยนแปลงที่ยังไม่บันทึกใช่หรือไม่?',
    'Give the map a name (3-24 characters)': 'ตั้งชื่อแผนที่ (3-24 ตัวอักษร)', 'Terrain data is invalid': 'ข้อมูลภูมิประเทศไม่ถูกต้อง', 'Invalid map data': 'ข้อมูลแผนที่ไม่ถูกต้อง',
    'Start {n} is too close to the map edge': 'จุดเริ่ม {n} อยู่ใกล้ขอบแผนที่เกินไป',
    'Starts {a} and {b} are too close together (min {n} tiles)': 'จุดเริ่ม {a} กับ {b} อยู่ใกล้กันเกินไป (อย่างน้อย {n} ช่อง)',
    'Start {n} needs open ground around it (rock or water is in the way)': 'จุดเริ่ม {n} ต้องมีพื้นโล่งรอบตัว (มีหินหรือน้ำขวางอยู่)', 'Start {n} cannot be reached from start 1': 'เดินจากจุดเริ่ม 1 ไปจุดเริ่ม {n} ไม่ถึง',
    '{n} ore tile(s) cannot be reached by harvesters': 'แร่ {n} ช่องที่รถเก็บแร่เข้าไม่ถึง', 'There is very little ore on this map': 'แผนที่นี้มีแร่น้อยมาก', 'Start {n} has no ore within 24 tiles': 'จุดเริ่ม {n} ไม่มีแร่ในระยะ 24 ช่อง',
    'Too many neutral structures (max {n})': 'อาคารเป็นกลางมากเกินไป (สูงสุด {n})', 'Unknown neutral structure': 'อาคารเป็นกลางไม่ถูกต้อง', '{name} at {x},{y} must sit on open ground without ore': '{name} ที่ {x},{y} ต้องอยู่บนพื้นโล่งที่ไม่มีแร่',
    '{name} at {x},{y} cannot be reached': '{name} ที่ {x},{y} เดินไปไม่ถึง', 'Two neutral structures are too close together': 'อาคารเป็นกลางสองแห่งอยู่ใกล้กันเกินไป', '{name} at {x},{y} is too close to a start position': '{name} ที่ {x},{y} อยู่ใกล้จุดเริ่มต้นเกินไป',
    'Players': 'ผู้เล่น', '3 players': '3 ผู้เล่น', '2 players (duel)': '2 ผู้เล่น (ดวล)', 'A map needs 2 or 3 start positions': 'แผนที่ต้องมีจุดเริ่มต้น 2 หรือ 3 จุด',
    'This map is for 2 players - close a slot first': 'แผนที่นี้สำหรับ 2 ผู้เล่น - ปิดหนึ่งช่องก่อน', 'This map is for 2 players - the third slot is taken': 'แผนที่นี้สำหรับ 2 ผู้เล่น - ช่องที่ 3 มีผู้เล่นอยู่',
    'map_saved': 'บันทึกแผนที่', 'map_deleted': 'ลบแผนที่',
    'Admin only': 'เฉพาะแอดมิน', 'Sign in required': 'ต้องเข้าสู่ระบบ', '← Back to game': '← กลับไปเกม', 'Go to sign in': 'ไปหน้าเข้าสู่ระบบ',
    'Sign in on the game page with an admin account first, then reload this page.': 'เข้าสู่ระบบด้วยบัญชีแอดมินที่หน้าเกมก่อน แล้วโหลดหน้านี้ใหม่',
    'Your session has expired. Sign in on the game page, then reload this page.': 'เซสชันหมดอายุ เข้าสู่ระบบที่หน้าเกมแล้วโหลดหน้านี้ใหม่',
    'No changes.': 'ไม่มีการเปลี่ยนแปลง', 'Unsaved changes.': 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก', 'Reset all to defaults': 'รีเซ็ตทั้งหมดเป็นค่าเริ่มต้น', 'Discard edits': 'ยกเลิกการแก้ไข', 'Save changes': 'บันทึกการเปลี่ยนแปลง',
    'Saved. New games use these values.': 'บันทึกแล้ว เกมใหม่จะใช้ค่าเหล่านี้', 'Saved. A game is running - values apply when it ends (new rooms started while idle).': 'บันทึกแล้ว มีเกมกำลังเล่นอยู่ - ค่าจะมีผลเมื่อเกมจบ',
    'Edits discarded.': 'ยกเลิกการแก้ไขแล้ว', 'All values reset to defaults.': 'รีเซ็ตทุกค่ากลับเป็นค่าเริ่มต้นแล้ว',
    'Units': 'ยูนิต', 'Weapons': 'อาวุธ', 'Armor': 'เกราะ', 'Bot AI': 'บอท AI', 'Rules': 'กติกา', 'Users': 'ผู้ใช้', 'Sign-in logs': 'บันทึกการเข้าสู่ระบบ', 'Matches': 'แมตช์', 'Rooms': 'ห้อง',
    'Structures. Yellow fields differ from the built-in defaults (hover a field to see the default). "Requires" is a comma separated list of building ids.': 'อาคาร ช่องสีเหลืองคือค่าที่ต่างจากค่าเริ่มต้น (เลื่อนเมาส์ไปที่ช่องเพื่อดูค่าเดิม) "Requires" คือรายชื่ออาคารที่ต้องมี คั่นด้วยจุลภาค',
    'Units. Speed is in tiles per second; build time is in seconds at full power.': 'ยูนิต ความเร็วเป็นช่องต่อวินาที เวลาสร้างเป็นวินาทีเมื่อไฟฟ้าเต็ม',
    'Global game rules.': 'กติกาทั่วไปของเกม', 'Reset this entry to defaults': 'รีเซ็ตรายการนี้เป็นค่าเริ่มต้น',
    'Name': 'ชื่อ', 'Description': 'คำอธิบาย', 'Cost': 'ราคา', 'Build time (s)': 'เวลาสร้าง (วินาที)', 'Hit points': 'พลังชีวิต', 'Speed (tiles/s)': 'ความเร็ว (ช่อง/วินาที)',
    'Power (+ makes, - uses)': 'ไฟฟ้า (+ ผลิต, - ใช้)', 'Vision': 'ระยะมองเห็น', 'Weapon': 'อาวุธ', 'Requires (comma separated buildings)': 'ต้องมีอาคาร (คั่นด้วยจุลภาค)', 'Ore capacity': 'ความจุแร่',
    'Damage': 'ความเสียหาย', 'Cooldown (s)': 'คูลดาวน์ (วินาที)', 'Range': 'ระยะยิง', 'Splash radius': 'รัศมีระเบิด', 'Projectile speed (0 = beam)': 'ความเร็วกระสุน (0 = ลำแสง)',
    'Damage class': 'ประเภทความเสียหาย', 'Targets': 'เป้าหมาย', 'Visual': 'ภาพเอฟเฟกต์', 'Multiplier': 'ตัวคูณ',
    'Think interval (s)': 'ช่วงคิดของบอท (วินาที)', 'Production speed x': 'ความเร็วผลิต x', 'Income x': 'รายได้ x', 'First wave size': 'ขนาดกองทัพระลอกแรก', 'Wave growth / 2 min': 'กองทัพเพิ่ม / 2 นาที', 'First attack (s)': 'บุกครั้งแรก (วินาที)',
    'Default start credits': 'เงินเริ่มต้นเริ่มต้น', 'Harvest rate (credits/s)': 'ความเร็วเก็บแร่ (เงิน/วินาที)', 'Unload rate (credits/s)': 'ความเร็วขนถ่ายแร่ (เงิน/วินาที)',
    'Orbital Lance charge time (s)': 'เวลาชาร์จลำแสงวงโคจร (วินาที)', 'Orbital Lance damage': 'ความเสียหายลำแสงวงโคจร', 'Orbital Lance radius': 'รัศมีลำแสงวงโคจร', 'Orbital Lance delay (s)': 'หน่วงเวลายิงลำแสง (วินาที)',
    'Repair speed (fraction of HP/s)': 'ความเร็วซ่อม (สัดส่วน HP/วินาที)', 'Sell refund (fraction of cost)': 'เงินคืนตอนขาย (สัดส่วนราคา)', 'Build radius (tiles)': 'รัศมีก่อสร้าง (ช่อง)',
    'Min. production speed on low power': 'ความเร็วผลิตต่ำสุดเมื่อไฟไม่พอ', 'Bonus per extra Barracks / Forge': 'โบนัสต่อค่าย/โรงงานที่เพิ่ม',
    'Weapons. Damage class decides which armor multipliers apply (see "Armor" tab). Set a unit\'s weapon on the Units / Structures tab. Projectile speed 0 = instant beam.': 'อาวุธ ประเภทความเสียหายกำหนดตัวคูณเกราะที่ใช้ (ดูแท็บ "เกราะ") ตั้งอาวุธของยูนิตได้ที่แท็บยูนิต/อาคาร ความเร็วกระสุน 0 = ลำแสงทันที',
    'Damage multiplier by damage class (rows) versus armor type (columns). 1 = full damage, 0 = immune.': 'ตัวคูณความเสียหายตามประเภทอาวุธ (แถว) เทียบกับชนิดเกราะ (คอลัมน์) 1 = เต็ม, 0 = ไม่เสียหาย',
    'AI difficulty levels. "First attack" is the game time (seconds) before the bot launches its first wave; income x > 1 gives the bot a harvesting bonus.': 'ระดับความยากของบอท "บุกครั้งแรก" คือเวลาในเกม (วินาที) ก่อนบอทส่งกองทัพระลอกแรก รายได้ x > 1 = บอทเก็บแร่ได้มากขึ้น',
    'Reset rating and stats': 'รีเซ็ตเรตติ้งและสถิติ', 'Make admin': 'ตั้งเป็นแอดมิน', 'Remove admin': 'ถอดแอดมิน', 'Reset password': 'รีเซ็ตรหัสผ่าน', 'Reset stats': 'รีเซ็ตสถิติ', 'Delete': 'ลบ',
    'User': 'ผู้ใช้', 'Role': 'สิทธิ์', 'Status': 'สถานะ', 'Last login': 'เข้าสู่ระบบล่าสุด', 'Last IP': 'IP ล่าสุด', '● online': '● ออนไลน์', 'offline': 'ออฟไลน์',
    'Every sign-in, failed attempt, registration, sign-out and admin action is recorded (kept in data/auth.log, newest 3000 shown here). Set TRUST_PROXY=1 when running behind a reverse proxy so real client IPs are recorded.': 'บันทึกทุกการเข้าสู่ระบบ ความพยายามที่ผิดพลาด การสมัคร การออกจากระบบ และการกระทำของแอดมิน (เก็บใน data/auth.log แสดง 3000 รายการล่าสุด) ตั้ง TRUST_PROXY=1 เมื่ออยู่หลัง reverse proxy เพื่อบันทึก IP จริง',
    'All events': 'ทุกเหตุการณ์', 'Any result': 'ทุกผลลัพธ์', 'Success only': 'สำเร็จเท่านั้น', 'Failures only': 'ล้มเหลวเท่านั้น', 'Search': 'ค้นหา', '↻ Refresh': '↻ รีเฟรช', 'Export CSV': 'ส่งออก CSV',
    'User contains…': 'ชื่อผู้ใช้มีคำว่า…', 'IP / note / browser contains…': 'IP / หมายเหตุ / เบราว์เซอร์ มีคำว่า…', 'Time ': 'เวลา', 'Result ': 'ผล', 'ok': 'สำเร็จ', 'failed': 'ล้มเหลว',
    'No log entries match.': 'ไม่พบรายการที่ตรงเงื่อนไข', 'Load older entries': 'โหลดรายการเก่ากว่า',
    'When ': 'เมื่อ', 'Length ': 'ความยาว', 'Code': 'รหัส', 'Host': 'เจ้าของห้อง', 'State': 'สถานะ', 'Players': 'ผู้เล่น', 'Game time': 'เวลาเกม', 'Close': 'ปิด', 'lobby': 'ล็อบบี้', 'playing': 'กำลังเล่น',
    'A game is currently running - saved config changes apply once no game is running.': 'มีเกมกำลังเล่นอยู่ - ค่าที่บันทึกจะมีผลเมื่อไม่มีเกมกำลังเล่น', 'No game is running.': 'ไม่มีเกมกำลังเล่น',
    'Password changed. The user was signed out.': 'เปลี่ยนรหัสผ่านแล้ว ผู้ใช้ถูกบังคับออกจากระบบ', 'Reset EVERY value to the built-in defaults from data.js?': 'รีเซ็ตทุกค่ากลับเป็นค่าเริ่มต้นจาก data.js ใช่หรือไม่?',
    'Matchmaking queue is empty.': 'คิวหาแมตช์ว่าง', 'No rooms.': 'ไม่มีห้อง', 'Results (place · rating change)': 'ผลลัพธ์ (อันดับ · เรตติ้งที่เปลี่ยน)',
  };

  for (const k of Object.keys(TH)) { const n = k.replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); if (n !== k && TH[n] === undefined) TH[n] = TH[k]; }

  // whole-page HTML blocks (help screen)
  const TH_HTML = {
    help_economy: 'สร้าง <b>เครื่องปฏิกรณ์ฟิวชัน</b> ก่อน (ไฟฟ้า) จากนั้นสร้าง <b>โรงกลั่นแร่</b> — มี <b>รถเก็บแร่นาโน</b> แถมให้ฟรีที่ขุดคริสตัลสีเขียวโดยอัตโนมัติ ถ้าไฟไม่พอ การผลิตจะช้าลง ป้อมปืนและเรดาร์จะหยุดทำงาน',
    help_base: 'คลิกอาคารในแถบด้านขวา รอจนขึ้น <b>พร้อม</b> แล้วคลิกอีกครั้งเพื่อวางใกล้ฐาน ค่ายทหารฝึกทหารราบ โรงงานประกอบสร้างยานพาหนะและโดรน <b>ระบบเรดาร์เซ็นเซอร์</b> ให้มินิแมพและปลดล็อกยูนิตขั้นสูง <b>ห้องวิจัยควอนตัม</b> ปลดล็อกเทคสูงสุดและอาวุธวินาศ <b>สถานีลิงก์วงโคจร</b>',
    help_controls: '<b>เมาส์ซ้าย</b> เลือก / ลากกรอบ · <b>เมาส์ขวา</b> เดิน / โจมตี / ขุดแร่ · <b>A</b> เคลื่อนที่-โจมตี · <b>S</b> หยุด · <b>D</b> ตั้งฐาน MCV · <b>H</b> กลับฐาน · <b>Space</b> ไปจุดที่ถูกโจมตีล่าสุด · <b>Ctrl+1-9</b> ตั้งกลุ่ม, <b>1-9</b> เรียกกลุ่ม · <b>R</b> ซ่อม · <b>X</b> ขาย · <b>Tab</b> สลับแท็บ · <b>Enter</b> แชท · ลูกศร / ขอบจอ / ลากปุ่มกลางเมาส์ เลื่อนกล้อง ล้อเมาส์ซูม <b>Shift+คลิก</b> การ์ด = ต่อคิว 5 ชิ้น',
    help_tips: '<b>วิศวกรบุกยึด</b> ยึดอาคารศัตรูได้ รวมถึงอาคารเป็นกลางอย่าง <b>แท่นขุดคริสตัล</b> (ได้เงินต่อเนื่อง) และ <b>คลังเสบียง</b> (ได้โบนัสเงิน) คลิกขวาที่ค่ายทหาร/โรงงานเพื่อกำหนด <b>จุดรวมพล</b> คลิกขวาที่ <b>กำแพงหิน</b> ด้วยยูนิตรบเพื่อยิงให้พังเป็นทางเดิน พลจรวดและป้อมพัลส์ยิงอากาศได้ รถเรลกันทำลายเกราะได้ดีมาก',
  };

  // ---------------------------------------------------------------------------- dynamic patterns
  const P = [
    [/^(\d+) games · (\d+) wins$/, (m) => `${m[1]} เกม · ชนะ ${m[2]}`],
    [/^(\d+) ranked games · peak (\d+)$/, (m) => `${m[1]} เกมจัดอันดับ · สูงสุด ${m[2]}`],
    [/^([\d,]+) \(default\)$/, (m) => `${m[1]} (ค่าเริ่มต้น)`],
    [/^(.+) \(taken\)$/, (m) => `${tt(m[1])} (มีคนใช้แล้ว)`],
    [/^🗺 (.+)$/, (m) => `🗺 ${tt(m[1])}`],
    [/^(\w+) \((easy|normal|hard)\)$/, (m) => `${m[1]} (${tt(m[2])})`],
    [/^Team (\d)$/, (m) => `ทีม ${m[1]}`],
    [/^AI — (\w+)$/, (m) => `บอท — ${tt(m[1])}`],
    [/^(.+?) ★ host \(you\)$/, (m) => `${m[1]} ★ เจ้าของห้อง (คุณ)`],
    [/^(.+?) ★ host$/, (m) => `${m[1]} ★ เจ้าของห้อง`],
    [/^(.+?) \(you\)$/, (m) => `${m[1]} (คุณ)`],
    [/^(.+)'s room$/, (m) => `ห้องของ ${m[1]}`],
    [/^(.*?) ?· ?(\d+)\/(\d+) players$/, (m) => `${m[1] ? m[1] + ' · ' : ''}${m[2]}/${m[3]} ผู้เล่น`],
    [/^(.+) requires (.+)$/, (m) => `${tt(m[1])} ต้องมี ${tt(m[2])}`],
    [/^Needs (.+)$/, (m) => `ต้องมี ${tt(m[1])}`],
    [/^Group (\d) set \((\d+)\)$/, (m) => `ตั้งกลุ่ม ${m[1]} แล้ว (${m[2]})`],
    [/^(.+) has been defeated!$/, (m) => `${m[1]} พ่ายแพ้แล้ว!`],
    [/^(.+) launched an Orbital Lance!$/, (m) => `${m[1]} ยิงลำแสงวงโคจร!`],
    [/^(.+) was captured!$/, (m) => `${tt(m[1])} ถูกยึดไปแล้ว!`],
    [/^(.+) captured!$/, (m) => `ยึด${tt(m[1])}สำเร็จ!`],
    [/^Bonus: \+(\d+) credits$/, (m) => `โบนัส +${m[1]} เครดิต`],
    [/^(.+) disconnected - AI took over$/, (m) => `${m[1]} หลุดการเชื่อมต่อ - บอทเล่นแทน`],
    [/^(Looking for opponents|(\d+) other players? searching)( · .*)?$/, (m) => `${m[2] ? `มีผู้เล่นอื่นกำลังค้นหาอีก ${m[2]} คน` : 'กำลังมองหาคู่ต่อสู้'}${m[3] ? (/humans only/.test(m[3]) ? ' · เฉพาะผู้เล่นจริง' : ' · บอทจะเติมให้ถ้ารอนาน') : ''}`],
    [/^(Ranked match|Unranked match \(not enough human players\)) — starting in (\d+)…$/, (m) => `${m[1] === 'Ranked match' ? 'แมตช์จัดอันดับ' : 'แมตช์ไม่นับอันดับ (ผู้เล่นจริงไม่พอ)'} — เริ่มใน ${m[2]}…`],
    [/^Ranked result: (\d+)\S* of (\d+) · rating (\d+) → (\d+) \(([+-]?\d+)\)$/, (m) => `ผลจัดอันดับ: อันดับ ${m[1]} จาก ${m[2]} · เรตติ้ง ${m[3]} → ${m[4]} (${m[5]})`],
    [/^Match finished: (\d+)\S* of (\d+)$/, (m) => `จบแมตช์: อันดับ ${m[1]} จาก ${m[2]}`],
    [/^peak (\d+)$/, (m) => `สูงสุด ${m[1]}`], [/^of (\d+)$/, (m) => `จาก ${m[1]}`], [/^(\d+) ranked$/, (m) => `จัดอันดับ ${m[1]}`], [/^(\d+) wins$/, (m) => `ชนะ ${m[1]}`],
    [/^best streak (\d+)$/, (m) => `ชนะติดต่อกันสูงสุด ${m[1]}`],
    [/^(\d+) ranked matches?$/, (m) => `${m[1]} แมตช์จัดอันดับ`],
    [/^(\d+) match\(es\) stored.*$/, (m) => `เก็บไว้ ${m[1]} แมตช์ (เก็บล่าสุด 500) แมตช์จัดอันดับจะเปลี่ยนเรตติ้ง Elo อันดับคือลำดับที่รอด (ออกกลางคันจะได้อันดับท้ายสุด)`],
    [/^(\d+) account\(s\)\..*$/, (m) => `${m[1]} บัญชี รหัสผ่านเก็บแบบ salted scrypt ดูไม่ได้ ทำได้เพียงรีเซ็ต`],
    [/^Matchmaking queue: (.+)$/, (m) => `คิวหาแมตช์: ${m[1]}`],
    [/^Signed in as (.+)$/, (m) => `เข้าสู่ระบบเป็น ${m[1]}`],
    [/^You are signed in as (.+), which is not an admin account\.$/, (m) => `คุณเข้าสู่ระบบเป็น ${m[1]} ซึ่งไม่ใช่บัญชีแอดมิน`],
    [/^Default: (.+)$/, (m) => `ค่าเริ่มต้น: ${m[1]}`],
    [/^New password for (.+) \(min 6 chars\):$/, (m) => `รหัสผ่านใหม่ของ ${m[1]} (อย่างน้อย 6 ตัวอักษร):`],
    [/^Delete account "(.+)"\?$/, (m) => `ลบบัญชี "${m[1]}" ใช่หรือไม่?`],
    [/^Reset rating and stats of "(.+)"\?$/, (m) => `รีเซ็ตเรตติ้งและสถิติของ "${m[1]}" ใช่หรือไม่?`],
    [/^Close room (\w+)\?$/, (m) => `ปิดห้อง ${m[1]} ใช่หรือไม่?`],
    [/^Delete map "(.+)"\?$/, (m) => `ลบแผนที่ "${m[1]}" ใช่หรือไม่?`],
  ];

  // ---------------------------------------------------------------------------- translation core
  const cache = new Map();
  const missing = new Set();
  GA.i18nMissing = missing;
  const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  function tt(s) { // translate a trimmed string (no whitespace preservation)
    if (lang !== 'th') return s;
    const n = norm(s);
    if (!n) return s;
    if (cache.has(n)) return cache.get(n);
    let r = TH[n];
    if (r === undefined) for (const [re, fn] of P) { const m = re.exec(n); if (m) { r = fn(m); break; } }
    if (r === undefined && /[A-Za-z]{3,}/.test(n) && !/[฀-๿]/.test(n)) missing.add(n);
    r = r === undefined ? n : r;
    if (cache.size < 5000) cache.set(n, r);
    return r;
  }
  GA.tt = tt;
  // explicit translation with {var} substitution
  GA.T = function (key, vars) {
    let s = tt(key);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  GA.ord = (n) => (lang === 'th' ? String(n) : n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'));

  function trText(str) {
    const lead = /^\s*/.exec(str)[0], trail = /\s*$/.exec(str)[0];
    const n = norm(str);
    if (!n) return str;
    const r = tt(n);
    return r === n ? str : lead + r + trail;
  }
  function trAttr(el, name) {
    const v = el.getAttribute(name);
    if (!v || !/[A-Za-z]/.test(v)) return;
    const out = v.split('\n').map((line) => trText(line)).join('\n');
    if (out !== v) el.setAttribute(name, out);
  }
  const noTr = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; return !!(e && e.closest && e.closest('[translate="no"]')); };
  function walk(root) {
    if (noTr(root)) return;
    if (root.nodeType === 3) { const t = trText(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    if (root.hasAttribute('title')) trAttr(root, 'title');
    if (root.hasAttribute('placeholder')) trAttr(root, 'placeholder');
    if (root.dataset && root.dataset.i18nHtml) { root.innerHTML = TH_HTML[root.dataset.i18nHtml] || root.innerHTML; return; }
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  }

  if (typeof document !== 'undefined' && lang === 'th') {
    const start = () => {
      document.title = tt(document.title);
      walk(document.body);
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'characterData') { if (noTr(m.target)) continue; const t = trText(m.target.nodeValue); if (t !== m.target.nodeValue) m.target.nodeValue = t; }
          else if (m.type === 'attributes') { if (!noTr(m.target)) trAttr(m.target, m.attributeName); }
          else for (const n of m.addedNodes) walk(n);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  // language switch buttons
  if (typeof document !== 'undefined') {
    const bind = () => document.querySelectorAll('[data-lang]').forEach((b) => { b.classList.toggle('on', b.dataset.lang === lang); b.onclick = () => { if (b.dataset.lang !== lang) GA.setLang(b.dataset.lang); }; });
    if (document.body) bind(); else document.addEventListener('DOMContentLoaded', bind);
  }
})();
