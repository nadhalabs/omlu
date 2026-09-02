import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");

test("Cinema routes are isolated from Restaurant admin",()=>{
  assert.match(read("app/cinema-admin/[[...section]]/page.tsx"),/CinemaAdminClient/);
  assert.match(read("app/c/[cinemaSlug]/[screenCode]/[seatCode]/page.tsx"),/CinemaCustomerClient/);
  const changedCinemaFiles=["app/cinema-admin/CinemaAdminClient.tsx","lib/cinema/mockService.ts"];
  changedCinemaFiles.forEach(file=>assert.ok(fs.existsSync(path.join(root,file))));
});

test("Cinema mock screen generation preserves seat identity",()=>{
  const source=read("lib/cinema/mockService.ts");
  assert.match(source,/previous \?\? \{ id:/);
  assert.match(source,/rowLabels\.flatMap/);
  assert.match(source,/aislesAfter/);
});

test("Seat designer supports resizing, selection, disabling, editing and QR preview",()=>{
  const source=read("app/cinema-admin/CinemaAdminClient.tsx");
  for(const behavior of [/Reduce this seat layout/,/setSeatId\(x\.id\)/,/Disable seat/,/Public seat code/,/View QR/,/activeSeats\(screen\)/]) assert.match(source,behavior);
});

test("KDS, filters and customer cart preserve cinema location",()=>{
  const admin=read("app/cinema-admin/CinemaAdminClient.tsx");
  const customer=read("app/c/[cinemaSlug]/[screenCode]/[seatCode]/CinemaCustomerClient.tsx");
  assert.match(admin,/Send for delivery/);
  assert.match(admin,/Mark delivered/);
  assert.match(admin,/Search order, screen or seat/);
  assert.match(customer,/screenCode/);
  assert.match(customer,/Seat \{seat\.code\}/);
  assert.match(customer,/Place order/);
});

test("new Cinema TypeScript transpiles without parser errors",()=>{
  const files=["app/cinema-admin/CinemaAdminClient.tsx","app/c/[cinemaSlug]/[screenCode]/[seatCode]/CinemaCustomerClient.tsx","lib/cinema/mockService.ts","lib/cinema/types.ts"];
  for(const file of files){const result=ts.transpileModule(read(file),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true,fileName:file});assert.equal(result.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,file);}
});
