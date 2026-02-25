import JSZip from "jszip";

const PLUGIN_VERSION = "1.0.0";
const ENDPOINT_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

const FILES: Record<string, string> = {
  "mission-metrics/mission-metrics.php": `<?php
/**
 * Plugin Name: Mission Metrics — ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.
 * Version:     ${PLUGIN_VERSION}
 * Author:      ACTV TRKR
 * License:     GPL-2.0-or-later
 * Text Domain: mission-metrics
 */
if(!defined('ABSPATH'))exit;
define('MM_PLUGIN_VERSION','${PLUGIN_VERSION}');
define('MM_PLUGIN_DIR',plugin_dir_path(__FILE__));
define('MM_PLUGIN_URL',plugin_dir_url(__FILE__));
require_once MM_PLUGIN_DIR.'includes/class-settings.php';
require_once MM_PLUGIN_DIR.'includes/class-tracker.php';
require_once MM_PLUGIN_DIR.'includes/class-gravity.php';
require_once MM_PLUGIN_DIR.'includes/class-retry-queue.php';
function mm_activate(){MM_Retry_Queue::create_table();if(!wp_next_scheduled('mm_retry_cron')){wp_schedule_event(time(),'mm_every_5_min','mm_retry_cron');}}
register_activation_hook(__FILE__,'mm_activate');
function mm_deactivate(){wp_clear_scheduled_hook('mm_retry_cron');}
register_deactivation_hook(__FILE__,'mm_deactivate');
add_filter('cron_schedules',function(\$s){\$s['mm_every_5_min']=array('interval'=>300,'display'=>'Every 5 Minutes');return \$s;});
MM_Settings::init();MM_Tracker::init();MM_Gravity::init();
add_action('mm_retry_cron',array('MM_Retry_Queue','process'));
`,

  "mission-metrics/includes/class-settings.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Settings{
const OPTION_GROUP='mm_settings';const OPTION_NAME='mm_options';
public static function init(){add_action('admin_menu',array(__CLASS__,'add_menu'));add_action('admin_init',array(__CLASS__,'register_settings'));add_action('wp_ajax_mm_test_connection',array(__CLASS__,'ajax_test_connection'));}
public static function defaults(){return array('api_key'=>'','endpoint_url'=>'${ENDPOINT_BASE}','enable_tracking'=>'1','enable_gravity'=>'1');}
public static function get(\$key=null){\$opts=wp_parse_args(get_option(self::OPTION_NAME,array()),self::defaults());return \$key?(\$opts[\$key]??null):\$opts;}
public static function add_menu(){add_options_page('Mission Metrics','Mission Metrics','manage_options','mission-metrics',array(__CLASS__,'render_page'));}
public static function register_settings(){register_setting(self::OPTION_GROUP,self::OPTION_NAME,array('sanitize_callback'=>array(__CLASS__,'sanitize')));}
public static function sanitize(\$input){\$c=array();\$c['api_key']=sanitize_text_field(\$input['api_key']??'');\$c['endpoint_url']=esc_url_raw(\$input['endpoint_url']??'');\$c['enable_tracking']=!empty(\$input['enable_tracking'])?'1':'0';\$c['enable_gravity']=!empty(\$input['enable_gravity'])?'1':'0';return \$c;}
public static function render_page(){\$opts=self::get();?>
<div class="wrap"><h1>Mission Metrics — ACTV TRKR</h1>
<form method="post" action="options.php"><?php settings_fields(self::OPTION_GROUP);?>
<table class="form-table">
<tr><th scope="row"><label for="mm_api_key">API Key</label></th><td><input type="password" id="mm_api_key" name="<?php echo self::OPTION_NAME;?>[api_key]" value="<?php echo esc_attr(\$opts['api_key']);?>" class="regular-text" autocomplete="off"/><p class="description">Paste the API key from your ACTV TRKR dashboard.</p></td></tr>
<tr><th scope="row"><label for="mm_endpoint">Endpoint URL</label></th><td><input type="url" id="mm_endpoint" name="<?php echo self::OPTION_NAME;?>[endpoint_url]" value="<?php echo esc_attr(\$opts['endpoint_url']);?>" class="regular-text"/></td></tr>
<tr><th scope="row">Enable Tracking</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_tracking]" value="1" <?php checked(\$opts['enable_tracking'],'1');?>/> Inject tracker.js on all front-end pages</label></td></tr>
<tr><th scope="row">Enable Gravity Forms</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_gravity]" value="1" <?php checked(\$opts['enable_gravity'],'1');?>/> Send Gravity Forms submissions to ACTV TRKR</label></td></tr>
</table><?php submit_button();?></form>
<hr/><h2>Test Connection</h2><p><button type="button" id="mm-test-btn" class="button button-secondary">Test Connection</button></p><div id="mm-test-result"></div>
<script>document.getElementById('mm-test-btn').addEventListener('click',function(){var b=this;b.disabled=true;document.getElementById('mm-test-result').textContent='Testing…';fetch(ajaxurl+'?action=mm_test_connection&_wpnonce=<?php echo wp_create_nonce("mm_test");?>').then(r=>r.json()).then(d=>{document.getElementById('mm-test-result').textContent=d.success?'✅ Connected!':'❌ '+(d.data||'Failed');b.disabled=false;}).catch(()=>{document.getElementById('mm-test-result').textContent='❌ Request failed';b.disabled=false;});});</script>
</div><?php }
public static function ajax_test_connection(){check_ajax_referer('mm_test','_wpnonce');if(!current_user_can('manage_options')){wp_send_json_error('Unauthorized');}\$opts=self::get();\$endpoint=rtrim(\$opts['endpoint_url'],'/').'/track-pageview';\$response=wp_remote_post(\$endpoint,array('timeout'=>10,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.\$opts['api_key']),'body'=>wp_json_encode(array('source'=>array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'type'=>'wordpress','plugin_version'=>MM_PLUGIN_VERSION),'event'=>array('page_url'=>home_url(),'event_id'=>'test_'.wp_generate_uuid4(),'session_id'=>'test','title'=>'Connection Test'),'attribution'=>new \\stdClass(),'visitor'=>array('visitor_id'=>'test')))));if(is_wp_error(\$response)){wp_send_json_error(\$response->get_error_message());}\$code=wp_remote_retrieve_response_code(\$response);if(\$code>=200&&\$code<300){wp_send_json_success();}else{wp_send_json_error('HTTP '.\$code.': '.wp_remote_retrieve_body(\$response));}}
}`,

  "mission-metrics/includes/class-tracker.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Tracker{
public static function init(){add_action('wp_enqueue_scripts',array(__CLASS__,'enqueue'));}
public static function enqueue(){if(is_admin())return;\$opts=MM_Settings::get();if(\$opts['enable_tracking']!=='1'||empty(\$opts['api_key']))return;wp_enqueue_script('mm-tracker',MM_PLUGIN_URL.'assets/tracker.js',array(),MM_PLUGIN_VERSION,true);wp_localize_script('mm-tracker','mmConfig',array('endpoint'=>rtrim(\$opts['endpoint_url'],'/').'/track-pageview','apiKey'=>\$opts['api_key'],'domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'pluginVersion'=>MM_PLUGIN_VERSION));}
}`,

  "mission-metrics/includes/class-gravity.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Gravity{
public static function init(){add_action('gform_after_submission',array(__CLASS__,'handle_submission'),10,2);}
public static function handle_submission(\$entry,\$form){\$opts=MM_Settings::get();if(\$opts['enable_gravity']!=='1'||empty(\$opts['api_key']))return;
\$visitor_id=isset(\$_COOKIE['mm_vid'])?sanitize_text_field(\$_COOKIE['mm_vid']):null;
\$session_id=isset(\$_COOKIE['mm_sid'])?sanitize_text_field(\$_COOKIE['mm_sid']):null;
\$utm_raw=isset(\$_COOKIE['mm_utm'])?json_decode(stripslashes(\$_COOKIE['mm_utm']),true):array();
if(!is_array(\$utm_raw))\$utm_raw=array();
\$fields=array();if(!empty(\$form['fields'])){foreach(\$form['fields'] as \$field){\$fid=\$field->id;\$value=rgar(\$entry,(string)\$fid);\$fields[]=array('id'=>\$fid,'label'=>\$field->label,'type'=>\$field->type,'value'=>\$value);}}
\$domain=wp_parse_url(home_url(),PHP_URL_HOST);
\$payload=array('entry'=>array('form_id'=>rgar(\$entry,'form_id'),'form_title'=>\$form['title']??'','entry_id'=>rgar(\$entry,'id'),'source_url'=>rgar(\$entry,'source_url'),'submitted_at'=>rgar(\$entry,'date_created')),'context'=>array('domain'=>\$domain,'referrer'=>wp_get_referer()?:null,'visitor_id'=>\$visitor_id,'session_id'=>\$session_id,'utm'=>\$utm_raw,'plugin_version'=>MM_PLUGIN_VERSION),'fields'=>\$fields);
\$endpoint=rtrim(\$opts['endpoint_url'],'/').'/ingest-gravity';
\$response=wp_remote_post(\$endpoint,array('timeout'=>5,'blocking'=>false,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.\$opts['api_key']),'body'=>wp_json_encode(\$payload)));
if(is_wp_error(\$response)){MM_Retry_Queue::enqueue(\$endpoint,\$opts['api_key'],\$payload);}}
}`,

  "mission-metrics/includes/class-retry-queue.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Retry_Queue{
const TABLE='mm_retry_queue';const MAX_ATTEMPTS=5;
public static function table_name(){global \$wpdb;return \$wpdb->prefix.self::TABLE;}
public static function create_table(){global \$wpdb;\$table=self::table_name();\$charset=\$wpdb->get_charset_collate();\$sql="CREATE TABLE IF NOT EXISTS {\$table}(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,endpoint VARCHAR(500) NOT NULL,api_key VARCHAR(500) NOT NULL,payload LONGTEXT NOT NULL,attempts TINYINT UNSIGNED DEFAULT 0,last_error TEXT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP) {\$charset};";require_once ABSPATH.'wp-admin/includes/upgrade.php';dbDelta(\$sql);}
public static function enqueue(\$endpoint,\$api_key,\$payload){global \$wpdb;\$wpdb->insert(self::table_name(),array('endpoint'=>\$endpoint,'api_key'=>\$api_key,'payload'=>wp_json_encode(\$payload)));}
public static function process(){global \$wpdb;\$table=self::table_name();\$now=current_time('mysql');\$rows=\$wpdb->get_results(\$wpdb->prepare("SELECT * FROM {\$table} WHERE attempts < %d AND next_retry_at <= %s ORDER BY created_at ASC LIMIT 20",self::MAX_ATTEMPTS,\$now));foreach(\$rows as \$row){\$response=wp_remote_post(\$row->endpoint,array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.\$row->api_key),'body'=>\$row->payload));\$code=is_wp_error(\$response)?0:wp_remote_retrieve_response_code(\$response);if(\$code>=200&&\$code<300){\$wpdb->delete(\$table,array('id'=>\$row->id));}else{\$attempts=(int)\$row->attempts+1;\$error=is_wp_error(\$response)?\$response->get_error_message():'HTTP '.\$code;\$delay=min(pow(2,\$attempts)*60,3600);\$next=gmdate('Y-m-d H:i:s',time()+\$delay);\$wpdb->update(\$table,array('attempts'=>\$attempts,'last_error'=>\$error,'next_retry_at'=>\$next),array('id'=>\$row->id));}}\$wpdb->query(\$wpdb->prepare("DELETE FROM {\$table} WHERE attempts >= %d",self::MAX_ATTEMPTS));}
}`,

  "mission-metrics/assets/tracker.js": `(function(){'use strict';if(typeof window==='undefined'||typeof document==='undefined')return;if(!window.mmConfig)return;var CFG=window.mmConfig;var COOKIE_VID='mm_vid';var COOKIE_SID='mm_sid';var COOKIE_UTM='mm_utm';var COOKIE_TS='mm_ts';var SESSION_TIMEOUT=30*60*1000;
function setCookie(n,v,d){var e=new Date();e.setTime(e.getTime()+d*864e5);document.cookie=n+'='+encodeURIComponent(v)+';expires='+e.toUTCString()+';path=/;SameSite=Lax';}
function getCookie(n){var v=document.cookie.match('(^|;)\\\\s*'+n+'=([^;]*)');return v?decodeURIComponent(v[2]):null;}
function uuid(){if(crypto&&crypto.randomUUID)return crypto.randomUUID();return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=(Math.random()*16)|0;return(c==='x'?r:(r&0x3)|0x8).toString(16);});}
function getUtms(){var p=new URLSearchParams(window.location.search);var keys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];var out={};var f=false;keys.forEach(function(k){var v=p.get(k);if(v){out[k]=v;f=true;}});return f?out:null;}
function storedUtms(){var r=getCookie(COOKIE_UTM);if(!r)return{};try{return JSON.parse(r);}catch(e){return{};}}
function utmsChanged(nu){if(!nu)return false;var old=storedUtms();return['utm_source','utm_medium','utm_campaign'].some(function(k){return(nu[k]||'')!==(old[k]||'');});}
function resolveSession(urlUtms){var sid=getCookie(COOKIE_SID);var lastTs=parseInt(getCookie(COOKIE_TS)||'0',10);var now=Date.now();var expired=!sid||!lastTs||(now-lastTs>SESSION_TIMEOUT);var utmSwitch=urlUtms&&utmsChanged(urlUtms);if(expired||utmSwitch){sid=uuid();}setCookie(COOKIE_SID,sid,1);setCookie(COOKIE_TS,String(now),1);return sid;}
function deviceType(){var w=window.innerWidth;if(w<768)return'mobile';if(w<1024)return'tablet';return'desktop';}
function send(payload){var body=JSON.stringify(payload);fetch(CFG.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+CFG.apiKey},body:body,keepalive:true}).catch(function(){try{navigator.sendBeacon(CFG.endpoint,new Blob([body],{type:'application/json'}));}catch(e){}});}
function track(){var vid=getCookie(COOKIE_VID);if(!vid){vid=uuid();setCookie(COOKIE_VID,vid,365);}var urlUtms=getUtms();if(urlUtms){setCookie(COOKIE_UTM,JSON.stringify(urlUtms),30);}var sid=resolveSession(urlUtms);var attribution=Object.assign({},storedUtms(),urlUtms||{});var eventId=uuid();send({source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},event:{event_id:eventId,session_id:sid,page_url:window.location.href,page_path:window.location.pathname,title:document.title,referrer:document.referrer||null,device:deviceType(),occurred_at:new Date().toISOString()},attribution:attribution,visitor:{visitor_id:vid}});}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',track);}else{track();}})();`,

  "mission-metrics/readme.txt": `=== Mission Metrics — ACTV TRKR ===
Contributors: actvtrkr
Tags: analytics, tracking, gravity forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: ${PLUGIN_VERSION}
License: GPL-2.0-or-later

First-party pageview tracking and Gravity Forms lead ingestion for ACTV TRKR.

== Description ==
Mission Metrics connects your WordPress site to your ACTV TRKR dashboard.

== Installation ==
1. Upload the plugin folder to /wp-content/plugins/
2. Activate the plugin
3. Go to Settings → Mission Metrics
4. Paste your API key
5. Enable tracking

== Changelog ==
= ${PLUGIN_VERSION} =
* Initial release`,
};

export async function downloadPlugin() {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(FILES)) {
    zip.file(path, content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mission-metrics.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
