import fs from 'fs';
let content = fs.readFileSync('src/firebase.js', 'utf8');

const broken = `if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "att_projects") {
    localStorage.setItem("att_projects", JSON.stringify(current));
    notifyProjectListeners();
    return newProj;
  }
};`;

const fixed = `if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "att_projects") {
      notifyProjectListeners();
    }
  });
}

export const createProject = async (projectData) => {
  const newProj = {
    id: dbType === "firebase" ? "" : "proj-" + Math.random().toString(36).substr(2, 9),
    name: projectData.name,
    startDate: projectData.startDate,
    endDate: projectData.endDate,
    managerId: projectData.managerId,
    teamMembers: projectData.teamMembers || [projectData.managerId],
    companyId: projectData.companyId,
    status: projectData.status || "Ongoing",
    createdAt: new Date().toISOString()
  };

  if (dbType === "firebase") {
    const docRef = await addDoc(collection(db, "projects"), newProj);
    await updateDoc(docRef, { id: docRef.id });
    return { ...newProj, id: docRef.id };
  } else {
    const current = localStorage.getItem("att_projects")
      ? JSON.parse(localStorage.getItem("att_projects"))
      : [];
    current.push(newProj);
    localStorage.setItem("att_projects", JSON.stringify(current));
    notifyProjectListeners();
    return newProj;
  }
};`;

content = content.replace(broken, fixed);
fs.writeFileSync('src/firebase.js', content);
