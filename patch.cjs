const fs = require('fs'); 
let code = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8'); 
code = code.replace(
  'export default function AdminDashboard() {', 
  "import { recoverSpecificUser } from '../firebase';\nexport default function AdminDashboard() {\n  useEffect(() => { recoverSpecificUser('Mohammed Arshak').then(r => alert('RECOVERY RESULT: ' + r)).catch(e => console.error(e)); }, []);"
); 
fs.writeFileSync('src/pages/AdminDashboard.jsx', code);
