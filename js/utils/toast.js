// simple toast for ux feedback on lasso
import CONFIG from '../config.js';
const TOAST_SHOW_TIME = CONFIG.TOAST_SHOW_TIME || 3000;

export function showToast(msg, isError = false) {
    const toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.classList.add("show");
    if (isError) {
        toast.style.backgroundColor = "#e74c3c";
        toast.style.color = "#fff";
    } else {
        toast.style.backgroundColor = "#fff";
        toast.style.color = "#000";
    }
    setTimeout(() => {
        toast.classList.remove("show");
    }, TOAST_SHOW_TIME);
}
