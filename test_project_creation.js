const data = {
    name: "Test Project",
    description: "Test",
    space: "Testing",
    template: "None",
    role: "Owner",
    tags: ["test"],
    id: "test01"
};

fetch("http://localhost:4001/api/ontology/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
}).then(res => res.json().then(j => ({ status: res.status, body: j }))).then(console.log).catch(console.error);
