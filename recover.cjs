const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
const recoveryCode = `
  useEffect(() => {
    try {
      const users = JSON.parse(localStorage.getItem('att_users') || '[]');
      const atts = JSON.parse(localStorage.getItem('att_attendance') || '{}');
      const tasks = JSON.parse(localStorage.getItem('att_tasks') || '[]');
      let missingName = 'Mohammed Arshak M U';
      let missingUid = null;
      let missingCompany = null;
      for (const logs of Object.values(atts)) {
        for (const log of logs) {
          if (log.userName === missingName || log.name === missingName) {
            missingUid = log.uid;
            missingCompany = log.companyId;
            break;
          }
        }
      }
      if (!missingUid) {
        for (const task of tasks) {
          if (task.assigneeName === missingName) {
            missingUid = task.assigneeId;
            missingCompany = task.companyId;
            break;
          }
        }
      }
      if (missingUid && !users.find(u => u.uid === missingUid)) {
        users.push({
          uid: missingUid,
          companyId: missingCompany,
          name: missingName,
          email: 'mohammedarshak@example.com',
          role: 'employee',
          status: 'active',
          department: 'Development',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('att_users', JSON.stringify(users));
        alert('Successfully recovered missing user profile!');
        window.location.reload();
      }
    } catch (e) { console.error('Recovery failed', e); }
  }, []);
`;
code = code.replace('export default function AdminDashboard() {', 'export default function AdminDashboard() {' + recoveryCode);
fs.writeFileSync('src/pages/AdminDashboard.jsx', code);
