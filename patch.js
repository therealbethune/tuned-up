const fs = require('fs');
const path = 'src/app/feed/page.tsx';
let code = fs.readFileSync(path, 'utf8');
code = code.replace('const { userId } = await auth();', 'const userId = "u1"; // const { userId } = await auth();');
code = code.replace('if (!userId) redirect("/");', '// if (!userId) redirect("/");');
code = code.replace('await syncCurrentUser();', '// await syncCurrentUser();');
fs.writeFileSync(path, code);

const path2 = 'src/app/api/ratings/route.ts';
let code2 = fs.readFileSync(path2, 'utf8');
code2 = code2.replace('const { userId } = await auth();', 'const userId = "u1"; // const { userId } = await auth();');
code2 = code2.replace('if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });', '// if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });');
code2 = code2.replace('await syncCurrentUser();', '// await syncCurrentUser();');
fs.writeFileSync(path2, code2);
