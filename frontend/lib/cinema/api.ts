import { publicBackendBaseUrl } from "@/lib/api";
import type { CinemaOrder, CinemaOrderStatus, CinemaScreen, CinemaSeat } from "./types";

type ApiSeat = { id:number;row_label:string;seat_number:number;public_code:string;position_index:number;aisle_after:boolean;is_active:boolean;is_accessible:boolean };
type ApiScreen = { id:number;name:string;code:string;is_active:boolean;seats:ApiSeat[] };
type ApiOrder = { id:number;order_number:string;status:string;subtotal:string;screen_id:number;seat_code:string;created_at:string;items:Array<{name:string;quantity:number;unit_price:string;note?:string}>;public_token:string };

const statusFromApi = (value:string):CinemaOrderStatus => value === "pending" ? "new" : value.replaceAll("_", "-") as CinemaOrderStatus;
const statusToApi = (value:CinemaOrderStatus) => value === "new" ? "pending" : value.replaceAll("-", "_");
const seat = (s:ApiSeat):CinemaSeat => ({id:String(s.id),row:s.row_label,number:s.seat_number,code:s.public_code,status:!s.is_active?"disabled":s.is_accessible?"accessible":"active"});
export const screen = (s:ApiScreen):CinemaScreen => { const seats=s.seats.map(seat); const rows=[...new Set(seats.map(x=>x.row))]; return {id:String(s.id),name:s.name,code:s.code,rows,seatsPerRow:Math.max(0,...seats.map(x=>x.number)),aislesAfter:[...new Set(s.seats.filter(x=>x.aisle_after).map(x=>x.seat_number))],seats}; };
const order = (o:ApiOrder):CinemaOrder => ({id:o.order_number,backendId:String(o.id),publicToken:o.public_token,screenId:String(o.screen_id),seatCode:o.seat_code,status:statusFromApi(o.status),placedMinutesAgo:Math.max(0,Math.floor((Date.now()-Date.parse(o.created_at))/60000)),items:o.items.map(x=>({name:x.name,quantity:x.quantity,price:Number(x.unit_price),note:x.note}))});

async function admin(path:string, init?:RequestInit) { const r=await fetch(`/api/cinema/${path}`,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})},cache:"no-store"}); if(!r.ok) throw new Error((await r.json()).detail||"Cinema API request failed"); return r.json(); }
export async function loadScreens(){return ((await admin("screens")) as ApiScreen[]).map(screen)}
export async function addScreen(body:{name:string;code:string;rows:number;seats_per_row:number;aisles_after:number[]}){return screen(await admin("screens",{method:"POST",body:JSON.stringify(body)}))}
export async function saveLayout(id:string,rows:number,seats_per_row:number,aisles_after:number[]){return screen(await admin(`screens/${id}/layout`,{method:"PUT",body:JSON.stringify({rows,seats_per_row,aisles_after})}))}
export async function saveSeat(screenId:string,seatId:string,body:{public_code?:string;is_active?:boolean;is_accessible?:boolean}){return seat(await admin(`screens/${screenId}/seats/${seatId}`,{method:"PATCH",body:JSON.stringify(body)}))}
export async function loadOrders(){return ((await admin("orders")) as ApiOrder[]).map(order)}
export async function advanceOrder(value:CinemaOrder,next:CinemaOrderStatus){return order(await admin(`orders/${value.backendId}/status`,{method:"PATCH",body:JSON.stringify({status:statusToApi(next)})}))}

export async function openSeat(slug:string,screenCode:string,seatCode:string){ const base=publicBackendBaseUrl(), route=`${base}/public/cinemas/${encodeURIComponent(slug)}/screens/${encodeURIComponent(screenCode)}/seats/${encodeURIComponent(seatCode)}`; const resolved=await fetch(route,{cache:"no-store"}); if(!resolved.ok) throw new Error("Seat not found"); const session=await fetch(`${route}/sessions`,{method:"POST"}); if(!session.ok) throw new Error("Unable to authorize this seat"); const menu=await fetch(`${route}/menu`,{cache:"no-store"}); if(!menu.ok) throw new Error("Unable to load concessions"); return {resolved:await session.json(),menu:await menu.json()}; }
export async function placeOrder(token:string,items:Array<{menu_item_id:number;quantity:number}>){ const r=await fetch(`${publicBackendBaseUrl()}/public/cinemas/orders`,{method:"POST",headers:{"Content-Type":"application/json","X-Cinema-Seat-Token":token,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({items})}); if(!r.ok) throw new Error((await r.json()).detail||"Order failed"); return r.json(); }
export async function trackOrder(token:string,publicToken:string){const r=await fetch(`${publicBackendBaseUrl()}/public/cinemas/orders/${encodeURIComponent(publicToken)}`,{headers:{"X-Cinema-Seat-Token":token},cache:"no-store"});if(!r.ok)throw new Error("Order tracking unavailable");return r.json()}
