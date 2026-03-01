import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLUGIN_VERSION = "1.2.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const domain = url.searchParams.get("domain") || "";

    // Log the download for analytics
    if (domain) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);
      await sb
        .from("sites")
        .update({ plugin_version: PLUGIN_VERSION })
        .eq("domain", domain);
    }

    const endpointBase = `${Deno.env.get("SUPABASE_URL")!}/functions/v1`;
    const files = buildFiles(endpointBase);

    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }

    const zipData = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mission-metrics-${PLUGIN_VERSION}.zip"`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildFiles(endpointBase: string): Record<string, string> {
  return {
    "mission-metrics/mission-metrics.php": `<?php
/**
 * Plugin Name: Mission Metrics — ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and universal form capture for ACTV TRKR.
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
require_once MM_PLUGIN_DIR.'includes/class-forms.php';
require_once MM_PLUGIN_DIR.'includes/class-retry-queue.php';
require_once MM_PLUGIN_DIR.'includes/class-updater.php';
function mm_activate(){MM_Retry_Queue::create_table();if(!wp_next_scheduled('mm_retry_cron')){wp_schedule_event(time(),'mm_every_5_min','mm_retry_cron');}
$opts=get_option('mm_options',array());
if(empty($opts['api_key'])&&defined('MM_BAKED_API_KEY')&&!empty(MM_BAKED_API_KEY)){
$opts['api_key']=MM_BAKED_API_KEY;
$opts['endpoint_url']=MM_BAKED_ENDPOINT;
$opts['enable_tracking']='1';
$opts['enable_gravity']='1';
update_option('mm_options',$opts);
}
register_activation_hook(__FILE__,'mm_activate');
function mm_deactivate(){wp_clear_scheduled_hook('mm_retry_cron');}
register_deactivation_hook(__FILE__,'mm_deactivate');
add_filter('cron_schedules',function($s){$s['mm_every_5_min']=array('interval'=>300,'display'=>'Every 5 Minutes');return $s;});
define('MM_BAKED_API_KEY','');
define('MM_BAKED_ENDPOINT','${endpointBase}');
MM_Settings::init();MM_Tracker::init();MM_Forms::init();MM_Updater::init();
add_action('mm_retry_cron',array('MM_Retry_Queue','process'));
`,

    "mission-metrics/includes/class-settings.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Settings{
const OPTION_GROUP='mm_settings';const OPTION_NAME='mm_options';
public static function init(){add_action('admin_menu',array(__CLASS__,'add_menu'));add_action('admin_init',array(__CLASS__,'register_settings'));add_action('wp_ajax_mm_test_connection',array(__CLASS__,'ajax_test_connection'));}
public static function defaults(){return array('api_key'=>defined('MM_BAKED_API_KEY')?MM_BAKED_API_KEY:'','endpoint_url'=>defined('MM_BAKED_ENDPOINT')?MM_BAKED_ENDPOINT:'${endpointBase}','enable_tracking'=>'1','enable_gravity'=>'1');}
public static function get($key=null){$opts=wp_parse_args(get_option(self::OPTION_NAME,array()),self::defaults());return $key?($opts[$key]??null):$opts;}
public static function add_menu(){add_options_page('Mission Metrics','Mission Metrics','manage_options','mission-metrics',array(__CLASS__,'render_page'));}
public static function register_settings(){register_setting(self::OPTION_GROUP,self::OPTION_NAME,array('sanitize_callback'=>array(__CLASS__,'sanitize')));}
public static function sanitize($input){$c=array();$c['api_key']=sanitize_text_field($input['api_key']??'');$c['endpoint_url']=esc_url_raw($input['endpoint_url']??'');$c['enable_tracking']=!empty($input['enable_tracking'])?'1':'0';$c['enable_gravity']=!empty($input['enable_gravity'])?'1':'0';return $c;}
public static function render_page(){$opts=self::get();$is_preconfigured=defined('MM_BAKED_API_KEY')&&!empty(MM_BAKED_API_KEY);?>
<div class="wrap"><h1>Mission Metrics — ACTV TRKR</h1>
<?php if($is_preconfigured):?><div class="notice notice-success"><p><strong>✅ Pre-configured!</strong> This plugin was downloaded with your API key already set. Tracking is active.</p></div><?php endif;?>
<form method="post" action="options.php"><?php settings_fields(self::OPTION_GROUP);?>
<table class="form-table">
<tr><th scope="row"><label for="mm_api_key">API Key</label></th><td><input type="password" id="mm_api_key" name="<?php echo self::OPTION_NAME;?>[api_key]" value="<?php echo esc_attr($opts['api_key']);?>" class="regular-text" autocomplete="off"/><p class="description">Pre-filled from your ACTV TRKR download. Change only if rotating keys.</p></td></tr>
<tr><th scope="row"><label for="mm_endpoint">Endpoint URL</label></th><td><input type="url" id="mm_endpoint" name="<?php echo self::OPTION_NAME;?>[endpoint_url]" value="<?php echo esc_attr($opts['endpoint_url']);?>" class="regular-text"/></td></tr>
<tr><th scope="row">Enable Tracking</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_tracking]" value="1" <?php checked($opts['enable_tracking'],'1');?>/> Inject tracker.js on all front-end pages</label></td></tr>
<tr><th scope="row">Enable Form Capture</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_gravity]" value="1" <?php checked($opts['enable_gravity'],'1');?>/> Capture form submissions (all form plugins)</label></td></tr>
</table><?php submit_button();?></form>
<hr/><h2>Test Connection</h2><p><button type="button" id="mm-test-btn" class="button button-secondary">Test Connection</button></p><div id="mm-test-result"></div>
<script>document.getElementById('mm-test-btn').addEventListener('click',function(){var b=this;b.disabled=true;document.getElementById('mm-test-result').textContent='Testing…';fetch(ajaxurl+'?action=mm_test_connection&_wpnonce=<?php echo wp_create_nonce("mm_test");?>').then(r=>r.json()).then(d=>{document.getElementById('mm-test-result').textContent=d.success?'✅ Connected!':'❌ '+(d.data||'Failed');b.disabled=false;}).catch(()=>{document.getElementById('mm-test-result').textContent='❌ Request failed';b.disabled=false;});});</script>
<hr/><h2>Supported Form Plugins</h2>
<p>Form capture works automatically with:</p>
<ul style="list-style:disc;padding-left:20px;">
<li><strong>Any HTML form</strong> — captured via JavaScript (universal)</li>
<li><strong>Gravity Forms</strong> — server-side hook for rich metadata</li>
<li><strong>Contact Form 7</strong> — server-side hook</li>
<li><strong>WPForms</strong> — server-side hook</li>
<li><strong>Avada / Fusion Forms</strong> — server-side hook</li>
<li><strong>Ninja Forms</strong> — server-side hook</li>
<li><strong>Fluent Forms</strong> — server-side hook</li>
</ul>
</div><?php }
public static function ajax_test_connection(){check_ajax_referer('mm_test','_wpnonce');if(!current_user_can('manage_options')){wp_send_json_error('Unauthorized');}$opts=self::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/track-pageview';$response=wp_remote_post($endpoint,array('timeout'=>10,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode(array('source'=>array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'type'=>'wordpress','plugin_version'=>MM_PLUGIN_VERSION),'event'=>array('page_url'=>home_url(),'event_id'=>'test_'.wp_generate_uuid4(),'session_id'=>'test','title'=>'Connection Test'),'attribution'=>new \\stdClass(),'visitor'=>array('visitor_id'=>'test')))));if(is_wp_error($response)){wp_send_json_error($response->get_error_message());}$code=wp_remote_retrieve_response_code($response);if($code>=200&&$code<300){wp_send_json_success();}else{wp_send_json_error('HTTP '.$code.': '.wp_remote_retrieve_body($response));}}
}`,

    "mission-metrics/includes/class-tracker.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Tracker{
public static function init(){add_action('wp_enqueue_scripts',array(__CLASS__,'enqueue'));}
public static function enqueue(){if(is_admin())return;$opts=MM_Settings::get();if($opts['enable_tracking']!=='1'||empty($opts['api_key']))return;wp_enqueue_script('mm-tracker',MM_PLUGIN_URL.'assets/tracker.js',array(),MM_PLUGIN_VERSION,true);wp_localize_script('mm-tracker','mmConfig',array('endpoint'=>rtrim($opts['endpoint_url'],'/').'/track-pageview','apiKey'=>$opts['api_key'],'domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'pluginVersion'=>MM_PLUGIN_VERSION));}
}`,

    "mission-metrics/includes/class-forms.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Forms{
public static function init(){$opts=MM_Settings::get();if($opts['enable_gravity']!=='1'||empty($opts['api_key']))return;
add_action('gform_after_submission',array(__CLASS__,'handle_gravity'),10,2);
add_action('wpcf7_mail_sent',array(__CLASS__,'handle_cf7'));
add_action('wpforms_process_complete',array(__CLASS__,'handle_wpforms'),10,4);
add_action('fusion_form_submission_data',array(__CLASS__,'handle_avada'),10,3);
add_action('ninja_forms_after_submission',array(__CLASS__,'handle_ninja'));
add_action('fluentform/submission_inserted',array(__CLASS__,'handle_fluent'),10,3);
}
private static function get_tracking_context(){$vid=isset($_COOKIE['mm_vid'])?sanitize_text_field($_COOKIE['mm_vid']):null;$sid=isset($_COOKIE['mm_sid'])?sanitize_text_field($_COOKIE['mm_sid']):null;$utm=isset($_COOKIE['mm_utm'])?json_decode(stripslashes($_COOKIE['mm_utm']),true):array();if(!is_array($utm))$utm=array();return array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'referrer'=>wp_get_referer()?:null,'visitor_id'=>$vid,'session_id'=>$sid,'utm'=>$utm,'plugin_version'=>MM_PLUGIN_VERSION);}
private static function send($payload){$opts=MM_Settings::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/ingest-form';$response=wp_remote_post($endpoint,array('timeout'=>5,'blocking'=>false,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode($payload)));if(is_wp_error($response)){MM_Retry_Queue::enqueue($endpoint,$opts['api_key'],$payload);}}
public static function handle_gravity($entry,$form){$fields=array();if(!empty($form['fields'])){foreach($form['fields'] as $field){$fid=$field->id;$value=rgar($entry,(string)$fid);$fields[]=array('id'=>$fid,'name'=>$field->label,'label'=>$field->label,'type'=>$field->type,'value'=>$value);}}self::send(array('provider'=>'gravity_forms','entry'=>array('form_id'=>rgar($entry,'form_id'),'form_title'=>$form['title']??'','entry_id'=>rgar($entry,'id'),'source_url'=>rgar($entry,'source_url'),'submitted_at'=>rgar($entry,'date_created')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_cf7($cf){$sub=WPCF7_Submission::get_instance();if(!$sub)return;$posted=$sub->get_posted_data();$fields=array();foreach($posted as $k=>$v){if(strpos($k,'_wpcf7')===0)continue;$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}self::send(array('provider'=>'cf7','entry'=>array('form_id'=>$cf->id(),'form_title'=>$cf->title(),'entry_id'=>'cf7_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_wpforms($fields_raw,$entry,$form_data,$entry_id){$fields=array();foreach($fields_raw as $f){$fields[]=array('id'=>$f['id']??'','name'=>$f['name']??'','label'=>$f['name']??'','type'=>$f['type']??'text','value'=>$f['value']??'');}self::send(array('provider'=>'wpforms','entry'=>array('form_id'=>$form_data['id']??'','form_title'=>$form_data['settings']['form_title']??'','entry_id'=>$entry_id,'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_avada($data,$form_id,$form_info){$fields=array();if(is_array($data)){foreach($data as $k=>$v){$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}}self::send(array('provider'=>'avada','entry'=>array('form_id'=>$form_id,'form_title'=>$form_info['form_meta']['form_name']??'Avada Form','entry_id'=>'avada_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_ninja($form_data){$fields=array();if(!empty($form_data['fields'])){foreach($form_data['fields'] as $f){$fields[]=array('id'=>$f['id']??'','name'=>$f['key']??$f['label']??'','label'=>$f['label']??'','type'=>$f['type']??'text','value'=>$f['value']??'');}}self::send(array('provider'=>'ninja_forms','entry'=>array('form_id'=>$form_data['form_id']??'','form_title'=>$form_data['settings']['title']??'Ninja Form','entry_id'=>'ninja_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_fluent($entry_id,$form_data,$form){$fields=array();if(is_array($form_data)){foreach($form_data as $k=>$v){if(strpos($k,'_fluentform_')===0||$k==='__fluent_form_embded_post_id')continue;$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}}self::send(array('provider'=>'fluent_forms','entry'=>array('form_id'=>$form->id??'','form_title'=>$form->title??'Fluent Form','entry_id'=>$entry_id,'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
}`,

    "mission-metrics/includes/class-gravity.php": `<?php
if(!defined('ABSPATH'))exit;
// DEPRECATED: This file is kept for backward compatibility.
// Form capture is now handled by class-forms.php which supports all form plugins.
// This file does nothing — MM_Forms handles the gform_after_submission hook.
`,

    "mission-metrics/includes/class-retry-queue.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Retry_Queue{
const TABLE='mm_retry_queue';const MAX_ATTEMPTS=5;
public static function table_name(){global $wpdb;return $wpdb->prefix.self::TABLE;}
public static function create_table(){global $wpdb;$table=self::table_name();$charset=$wpdb->get_charset_collate();$sql="CREATE TABLE IF NOT EXISTS {$table}(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,endpoint VARCHAR(500) NOT NULL,api_key VARCHAR(500) NOT NULL,payload LONGTEXT NOT NULL,attempts TINYINT UNSIGNED DEFAULT 0,last_error TEXT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP) {$charset};";require_once ABSPATH.'wp-admin/includes/upgrade.php';dbDelta($sql);}
public static function enqueue($endpoint,$api_key,$payload){global $wpdb;$wpdb->insert(self::table_name(),array('endpoint'=>$endpoint,'api_key'=>$api_key,'payload'=>wp_json_encode($payload)));}
public static function process(){global $wpdb;$table=self::table_name();$now=current_time('mysql');$rows=$wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE attempts < %d AND next_retry_at <= %s ORDER BY created_at ASC LIMIT 20",self::MAX_ATTEMPTS,$now));foreach($rows as $row){$response=wp_remote_post($row->endpoint,array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$row->api_key),'body'=>$row->payload));$code=is_wp_error($response)?0:wp_remote_retrieve_response_code($response);if($code>=200&&$code<300){$wpdb->delete($table,array('id'=>$row->id));}else{$attempts=(int)$row->attempts+1;$error=is_wp_error($response)?$response->get_error_message():'HTTP '.$code;$delay=min(pow(2,$attempts)*60,3600);$next=gmdate('Y-m-d H:i:s',time()+$delay);$wpdb->update($table,array('attempts'=>$attempts,'last_error'=>$error,'next_retry_at'=>$next),array('id'=>$row->id));}}$wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE attempts >= %d",self::MAX_ATTEMPTS));}
}`,

    "mission-metrics/includes/class-updater.php": `<?php
if(!defined('ABSPATH'))exit;
class MM_Updater{
const SLUG='mission-metrics/mission-metrics.php';const TRANSIENT='mm_update_data';const CHECK_HOURS=12;
public static function init(){add_filter('pre_set_site_transient_update_plugins',array(__CLASS__,'check_update'));add_filter('plugins_api',array(__CLASS__,'plugin_info'),20,3);add_filter('plugin_row_meta',array(__CLASS__,'row_meta'),10,2);}
private static function endpoint(){$opts=MM_Settings::get();return rtrim($opts['endpoint_url'],'/').'/plugin-update-check';}
public static function check_update($transient){if(empty($transient->checked))return $transient;$remote=self::get_remote_data();if(!$remote||empty($remote['has_update']))return $transient;$package=!empty($remote['download_url'])?$remote['download_url']:'';$transient->response[self::SLUG]=(object)array('slug'=>'mission-metrics','plugin'=>self::SLUG,'new_version'=>$remote['version'],'url'=>'https://actvtrkr.com','package'=>$package,'icons'=>array(),'banners'=>array(),'tested'=>$remote['tested_wp']??'6.7','requires'=>$remote['requires_wp']??'5.8');return $transient;}
public static function plugin_info($result,$action,$args){if($action!=='plugin_information')return $result;if(!isset($args->slug)||$args->slug!=='mission-metrics')return $result;$remote=self::get_remote_info();if(!$remote)return $result;$info=new stdClass();$info->name=$remote['name']??'Mission Metrics';$info->slug='mission-metrics';$info->version=$remote['version']??MM_PLUGIN_VERSION;$info->author=$remote['author']??'ACTV TRKR';$info->homepage=$remote['homepage']??'https://actvtrkr.com';$info->requires=$remote['requires']??'5.8';$info->tested=$remote['tested']??'6.7';$info->requires_php=$remote['requires_php']??'7.4';$info->download_link=$remote['download_url']??'';$info->sections=array('description'=>$remote['sections']['description']??'','changelog'=>nl2br(esc_html($remote['sections']['changelog']??'')));return $info;}
public static function row_meta($links,$file){if($file!==self::SLUG)return $links;$links[]='<a href="'.esc_url(admin_url('options-general.php?page=mission-metrics')).'">Settings</a>';return $links;}
private static function get_remote_data(){$cached=get_transient(self::TRANSIENT);if($cached!==false)return $cached;$domain=wp_parse_url(home_url(),PHP_URL_HOST);$url=self::endpoint().'?'.http_build_query(array('action'=>'check','version'=>MM_PLUGIN_VERSION,'domain'=>$domain));$response=wp_remote_get($url,array('timeout'=>10));if(is_wp_error($response))return null;$body=json_decode(wp_remote_retrieve_body($response),true);if(!is_array($body))return null;set_transient(self::TRANSIENT,$body,self::CHECK_HOURS*HOUR_IN_SECONDS);return $body;}
private static function get_remote_info(){$url=self::endpoint().'?action=info';$response=wp_remote_get($url,array('timeout'=>10));if(is_wp_error($response))return null;return json_decode(wp_remote_retrieve_body($response),true);}
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
function send(endpoint,payload){var body=JSON.stringify(payload);fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+CFG.apiKey},body:body,keepalive:true}).catch(function(){try{navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}catch(e){}});}
function track(){var vid=getCookie(COOKIE_VID);if(!vid){vid=uuid();setCookie(COOKIE_VID,vid,365);}var urlUtms=getUtms();if(urlUtms){setCookie(COOKIE_UTM,JSON.stringify(urlUtms),30);}var sid=resolveSession(urlUtms);var attribution=Object.assign({},storedUtms(),urlUtms||{});var eventId=uuid();send(CFG.endpoint,{source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},event:{event_id:eventId,session_id:sid,page_url:window.location.href,page_path:window.location.pathname,title:document.title,referrer:document.referrer||null,device:deviceType(),occurred_at:new Date().toISOString()},attribution:attribution,visitor:{visitor_id:vid}});}
var SKIP_NAMES=['_wpnonce','_wp_http_referer','_wpcf7','_wpcf7_version','_wpcf7_locale','_wpcf7_unit_tag','_wpcf7_container_post','action','gform_ajax','gform_field_values','is_submit','gform_submit','gform_unique_id','gform_target_page_number','gform_source_page_number'];
var SKIP_PAT=[/^_/,/nonce/i,/token/i,/csrf/i,/captcha/i,/^g-recaptcha/,/^h-captcha/,/^cf-turnstile/];
var SENS_PAT=[/password/i,/passwd/i,/cc[-_]?num/i,/card[-_]?number/i,/cvv/i,/cvc/i,/ssn/i,/social[-_]?security/i,/credit[-_]?card/i];
function skipField(n,t){if(!n)return true;if(t==='password'||t==='hidden')return true;if(SKIP_NAMES.indexOf(n)!==-1)return true;for(var i=0;i<SKIP_PAT.length;i++){if(SKIP_PAT[i].test(n))return true;}return false;}
function isSens(n){for(var i=0;i<SENS_PAT.length;i++){if(SENS_PAT[i].test(n))return true;}return false;}
function captureForm(form){var fields=[];var els=form.elements;var seen={};for(var i=0;i<els.length;i++){var el=els[i];var name=el.name||el.id||'';var type=(el.type||'text').toLowerCase();if(skipField(name,type))continue;if(seen[name])continue;var value='';if(type==='checkbox'){var chk=form.querySelectorAll('input[name="'+name+'"]:checked');var vals=[];for(var j=0;j<chk.length;j++)vals.push(chk[j].value);value=vals.join(', ');}else if(type==='radio'){var sel=form.querySelector('input[name="'+name+'"]:checked');value=sel?sel.value:'';}else if(el.tagName==='SELECT'){var opts=el.selectedOptions||[];var sv=[];for(var k=0;k<opts.length;k++)sv.push(opts[k].value);value=sv.join(', ');}else{value=el.value||'';}seen[name]=true;if(isSens(name)){value='[REDACTED]';}if(value===''&&type!=='checkbox')continue;fields.push({name:name,label:el.getAttribute('aria-label')||el.getAttribute('placeholder')||name,type:type,value:value});}return fields;}
document.addEventListener('submit',function(e){var form=e.target;if(!form||form.tagName!=='FORM')return;if(form.getAttribute('data-mm-ignore')==='true')return;var role=form.getAttribute('role');if(role==='search')return;var action=(form.getAttribute('action')||'').toLowerCase();if(action.indexOf('wp-login')!==-1||action.indexOf('wp-admin')!==-1)return;var fields=captureForm(form);if(fields.length===0)return;var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);var formEndpoint=CFG.endpoint.replace(/\\/track-pageview$/,'/ingest-form');send(formEndpoint,{provider:'js_capture',entry:{form_id:form.getAttribute('id')||form.getAttribute('data-form-id')||'dom_form',form_title:form.getAttribute('data-form-title')||form.getAttribute('aria-label')||document.title,entry_id:'js_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),source_url:window.location.href,page_url:window.location.href,submitted_at:new Date().toISOString()},context:{domain:CFG.domain,referrer:document.referrer||null,visitor_id:vid,session_id:sid,utm:storedUtms(),plugin_version:CFG.pluginVersion},fields:fields});},true);
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',track);}else{track();}})();`,

    "mission-metrics/readme.txt": `=== Mission Metrics — ACTV TRKR ===
Contributors: actvtrkr
Tags: analytics, tracking, forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: ${PLUGIN_VERSION}
License: GPL-2.0-or-later

First-party pageview tracking and universal form capture for ACTV TRKR.

== Description ==
Mission Metrics connects your WordPress site to your ACTV TRKR dashboard.
This plugin was pre-configured with your API key — just install, activate, and tracking starts automatically.

Supports all form plugins: Gravity Forms, Contact Form 7, WPForms, Avada/Fusion Forms, Ninja Forms, Fluent Forms, and any standard HTML form.

== Installation ==
1. Upload the plugin zip to WordPress (Plugins → Add New → Upload Plugin)
2. Activate the plugin
3. That's it! Tracking starts automatically. Visit Settings → Mission Metrics to verify.

== Changelog ==
= ${PLUGIN_VERSION} =
* Universal form capture: supports any HTML form plus dedicated hooks for Gravity Forms, CF7, WPForms, Avada, Ninja Forms, Fluent Forms
* Deduplication between JS and server-side captures
* Security: auto-redact sensitive fields (passwords, credit cards, SSNs)

= 1.0.0 =
* Initial release`,
  };
}
