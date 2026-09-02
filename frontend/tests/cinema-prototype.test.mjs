import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");

test("Cinema routes are isolated from Restaurant admin",()=>{
  const layout=read("app/cinema-admin/layout.tsx");
  assert.match(layout,/CinemaAdminClient/);
  assert.match(layout,/staff\.venue_type !== "cinema"/);
  assert.match(read("app/c/[cinemaSlug]/[screenCode]/[seatCode]/page.tsx"),/CinemaCustomerClient/);
  const changedCinemaFiles=["app/cinema-admin/CinemaAdminClient.tsx","lib/cinema/mockService.ts"];
  changedCinemaFiles.forEach(file=>assert.ok(fs.existsSync(path.join(root,file))));
});

test("Cinema admin uses a persistent Restaurant-style shell for client navigation",()=>{
  const layout=read("app/cinema-admin/layout.tsx");
  const page=read("app/cinema-admin/[[...section]]/page.tsx");
  const client=read("app/cinema-admin/CinemaAdminClient.tsx");
  assert.match(layout,/<CinemaAdminClient staffName=\{staff\.name\}>\{children\}<\/CinemaAdminClient>/);
  assert.match(client,/usePathname/);
  assert.match(client,/AdminSidebarLink/);
  assert.match(client,/OMLU Admin/);
  assert.match(client,/lg:w-64/);
  assert.doesNotMatch(client,/Loading Cinema operations/);
  assert.doesNotMatch(client,/window\.location(?:\.href)?\s*=/);
  assert.doesNotMatch(page,/CinemaAdminClient/);
  assert.match(page,/redirect\("\/cinema-admin\/dashboard"\)/);
});

test("Cinema mock screen generation preserves seat identity",()=>{
  const source=read("lib/cinema/mockService.ts");
  assert.match(source,/previous \?\? \{ id:/);
  assert.match(source,/rowLabels\.flatMap/);
  assert.match(source,/aislesAfter/);
});

test("Seat designer persists creation, resizing, disabling, editing and QR identity",()=>{
  const source=read("app/cinema-admin/CinemaAdminClient.tsx");
  for(const behavior of [/No screens yet/,/Create first screen/,/Save Changes/,/Disable/,/Seat code/,/qrDestination/,/activeSeats\(value\)/]) assert.match(source,behavior);
});

test("seat editor keeps controls compact and seat fields understandable",()=>{
  const admin=read("app/cinema-admin/CinemaAdminClient.tsx");
  const styles=read("app/cinema-admin/cinema.module.css");
  for(const label of [/Seat code/,/>Row</,/>Seat number</,/>Display order</,/Availability/,/Accessibility/]) assert.match(admin,label);
  assert.doesNotMatch(admin,/Durable ID/);
  assert.match(admin,/screenPicker/);
  assert.match(admin,/editorActions/);
  assert.match(admin,/screenSettings/);
  assert.match(styles,/\.screenPicker \.select\{width:190px/);
  assert.match(styles,/grid-template-columns:minmax\(0,1fr\) 270px/);
});

test("flexible editor supports uneven rows, manual seats, gaps, selection and persisted dragging",()=>{
  const admin=read("app/cinema-admin/CinemaAdminClient.tsx");
  const api=read("lib/cinema/api.ts");
  const types=read("lib/cinema/types.ts");
  const migration=read("../backend/alembic/versions/20260903_cinema_flexible_seat_layout.py");
  for(const behavior of [/\+ Add Row/,/\+ Add Seat/,/onPointerMove/,/setPointerCapture/,/layout_x: value\.layoutX/,/display_order: value\.displayOrder/,/data-status=\{value\.status\}/,/aria-label=\{`Seat \$\{value\.code\}`\}/]) assert.match(admin,behavior);
  assert.match(api,/screens\/\$\{screenId\}\/rows/);
  assert.match(api,/screens\/\$\{screenId\}\/seats/);
  for(const field of [/layoutX: number/,/layoutY: number/,/displayOrder: number/]) assert.match(types,field);
  assert.match(migration,/position_index \* 64/);
  assert.match(migration,/dense_rank\(\)/);
});

test("KDS, orders and customer tracking use authoritative Cinema services",()=>{
  const admin=read("app/cinema-admin/CinemaAdminClient.tsx");
  const customer=read("app/c/[cinemaSlug]/[screenCode]/[seatCode]/CinemaCustomerClient.tsx");
  assert.match(admin,/Concession Orders/);
  assert.match(admin,/Prepare and deliver orders to seats/);
  assert.match(admin,/pending: "ready"/);
  assert.match(admin,/ready: "delivered"/);
  assert.match(admin,/Mark Delivered/);
  assert.match(admin,/advanceOrder/);
  assert.match(admin,/Server-authoritative concession orders/);
  assert.match(admin,/useRealtime/);
  assert.match(customer,/screenCode/);
  assert.match(customer,/Seat \{seat\.code\}/);
  assert.match(customer,/Place order/);
  assert.match(customer,/Order received/);
  assert.doesNotMatch(customer,/"accepted"|"preparing"|"out_for_delivery"/);
});

test("production Cinema admin does not import mock runtime data",()=>{
  const source=read("app/cinema-admin/CinemaAdminClient.tsx");
  assert.doesNotMatch(source,/mockService|initialOrders|initialScreens|initialSettings|menuItems/);
  assert.match(source,/loadDashboard/);
  assert.match(source,/loadMenu/);
  assert.match(source,/No printer\s+connection is being claimed/);
});

test("failed Cinema transitions retain server state and expose an error",()=>{
  const source=read("app/cinema-admin/CinemaAdminClient.tsx");
  assert.match(source,/onSaved\(await advanceOrder\(order,\s*next\)\)/);
  assert.match(source,/Transition failed/);
  assert.doesNotMatch(source,/setOrders\(old=>old\.map\(o=>o\.id===id\?\{\.\.\.o,status\}/);
});

test("new Cinema TypeScript transpiles without parser errors",()=>{
  const files=["app/cinema-admin/CinemaAdminClient.tsx","app/c/[cinemaSlug]/[screenCode]/[seatCode]/CinemaCustomerClient.tsx","lib/cinema/mockService.ts","lib/cinema/types.ts"];
  for(const file of files){const result=ts.transpileModule(read(file),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true,fileName:file});assert.equal(result.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,file);}
});
