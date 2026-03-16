import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLUGIN_VERSION = "1.3.4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
        "Content-Disposition": `attachment; filename="actv-trkr-${PLUGIN_VERSION}.zip"`,
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
    "actv-trkr/actv-trkr.php": `<?php
/**
 * Plugin Name: ACTV TRKR
 * Plugin URI:  https://actvtrkr.com
 * Description: First-party pageview tracking and universal form capture for ACTV TRKR.
 * Version:     ${PLUGIN_VERSION}
 * Author:      MSHN CTRL
 * License:     GPL-2.0-or-later
 * Text Domain: actv-trkr
 */
if(!defined('ABSPATH'))exit;
define('AT_PLUGIN_VERSION','${PLUGIN_VERSION}');
define('AT_PLUGIN_DIR',plugin_dir_path(__FILE__));
define('AT_PLUGIN_URL',plugin_dir_url(__FILE__));
define('AT_DEFAULT_ENDPOINT','${endpointBase}');
require_once AT_PLUGIN_DIR.'includes/class-settings.php';
require_once AT_PLUGIN_DIR.'includes/class-tracker.php';
require_once AT_PLUGIN_DIR.'includes/class-forms.php';
require_once AT_PLUGIN_DIR.'includes/class-retry-queue.php';
require_once AT_PLUGIN_DIR.'includes/class-updater.php';
require_once AT_PLUGIN_DIR.'includes/class-heartbeat.php';
require_once AT_PLUGIN_DIR.'includes/class-broken-links.php';
function at_activate(){
  AT_Retry_Queue::create_table();
  if(!wp_next_scheduled('at_retry_cron')){wp_schedule_event(time(),'at_every_5_min','at_retry_cron');}
  if(!wp_next_scheduled('at_heartbeat_cron')){wp_schedule_event(time(),'at_every_5_min','at_heartbeat_cron');}
  if(!wp_next_scheduled('at_form_probe_cron')){wp_schedule_event(time(),'hourly','at_form_probe_cron');}
}
register_activation_hook(__FILE__,'at_activate');
function at_deactivate(){wp_clear_scheduled_hook('at_retry_cron');wp_clear_scheduled_hook('at_heartbeat_cron');wp_clear_scheduled_hook('at_form_probe_cron');}
register_deactivation_hook(__FILE__,'at_deactivate');
add_filter('cron_schedules',function($s){$s['at_every_5_min']=array('interval'=>300,'display'=>'Every 5 Minutes');return $s;});
AT_Settings::init();AT_Tracker::init();AT_Forms::init();AT_Updater::init();AT_Heartbeat::init();AT_Broken_Links::init();
add_action('at_retry_cron',array('AT_Retry_Queue','process'));
add_action('at_heartbeat_cron',array('AT_Heartbeat','send_cron_heartbeat'));
add_action('at_form_probe_cron',array('AT_Forms','probe_form_pages'));
`,

    "actv-trkr/includes/class-settings.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Settings{
const OPTION_GROUP='at_settings';const OPTION_NAME='at_options';
public static function init(){add_action('admin_menu',array(__CLASS__,'add_menu'));add_action('admin_init',array(__CLASS__,'register_settings'));add_action('wp_ajax_at_test_connection',array(__CLASS__,'ajax_test_connection'));add_action('wp_ajax_at_sync_forms',array(__CLASS__,'ajax_sync_forms'));}
public static function defaults(){return array('api_key'=>'','endpoint_url'=>defined('AT_DEFAULT_ENDPOINT')?AT_DEFAULT_ENDPOINT:'${endpointBase}','enable_tracking'=>'1','enable_forms'=>'1','enable_heartbeat'=>'1');}
public static function get($key=null){$opts=wp_parse_args(get_option(self::OPTION_NAME,array()),self::defaults());return $key?($opts[$key]??null):$opts;}
public static function add_menu(){add_options_page('ACTV TRKR','ACTV TRKR','manage_options','actv-trkr',array(__CLASS__,'render_page'));}
public static function register_settings(){register_setting(self::OPTION_GROUP,self::OPTION_NAME,array('sanitize_callback'=>array(__CLASS__,'sanitize')));}
public static function sanitize($input){$c=array();$c['api_key']=sanitize_text_field($input['api_key']??'');$c['endpoint_url']=esc_url_raw($input['endpoint_url']??'');$c['enable_tracking']=!empty($input['enable_tracking'])?'1':'0';$c['enable_forms']=!empty($input['enable_forms'])?'1':'0';$c['enable_heartbeat']=!empty($input['enable_heartbeat'])?'1':'0';return $c;}
public static function render_page(){$opts=self::get();?>
<div class="wrap"><h1>ACTV TRKR</h1>
<form method="post" action="options.php"><?php settings_fields(self::OPTION_GROUP);?>
<table class="form-table">
<tr><th scope="row"><label for="at_api_key">API Key</label></th><td><input type="password" id="at_api_key" name="<?php echo self::OPTION_NAME;?>[api_key]" value="<?php echo esc_attr($opts['api_key']);?>" class="regular-text" autocomplete="off"/><p class="description">Paste the API key from your ACTV TRKR dashboard.</p></td></tr>
<tr><th scope="row"><label for="at_endpoint">Endpoint URL</label></th><td><input type="url" id="at_endpoint" name="<?php echo self::OPTION_NAME;?>[endpoint_url]" value="<?php echo esc_attr($opts['endpoint_url']);?>" class="regular-text"/></td></tr>
<tr><th scope="row">Enable Tracking</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_tracking]" value="1" <?php checked($opts['enable_tracking'],'1');?>/> Inject tracker.js on all front-end pages</label></td></tr>
<tr><th scope="row">Enable Form Capture</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_forms]" value="1" <?php checked($opts['enable_forms'],'1');?>/> Capture form submissions (all form plugins)</label></td></tr>
<tr><th scope="row">Enable Heartbeat</th><td><label><input type="checkbox" name="<?php echo self::OPTION_NAME;?>[enable_heartbeat]" value="1" <?php checked($opts['enable_heartbeat'],'1');?>/> Send uptime heartbeat (JS beacon + WP-Cron fallback)</label></td></tr>
</table><?php submit_button();?></form>
<hr/><h2>Test Connection</h2><p><button type="button" id="at-test-btn" class="button button-secondary">Test Connection</button></p><div id="at-test-result"></div>
<hr/><h2>Sync Forms</h2>
<p class="description">Scan your site for all installed form plugins and register them with ACTV TRKR — even before any submissions.</p>
<p><button type="button" id="at-sync-btn" class="button button-secondary">Sync Forms Now</button></p><div id="at-sync-result"></div>
<script>
document.getElementById('at-test-btn').addEventListener('click',function(){var b=this;b.disabled=true;document.getElementById('at-test-result').textContent='Testing…';fetch(ajaxurl+'?action=at_test_connection&_wpnonce=<?php echo wp_create_nonce("at_test");?>').then(r=>r.json()).then(d=>{document.getElementById('at-test-result').textContent=d.success?'✅ Connected!':'❌ '+(d.data||'Failed');b.disabled=false;}).catch(()=>{document.getElementById('at-test-result').textContent='❌ Request failed';b.disabled=false;});});
document.getElementById('at-sync-btn').addEventListener('click',function(){var b=this;b.disabled=true;document.getElementById('at-sync-result').textContent='Scanning…';fetch(ajaxurl+'?action=at_sync_forms&_wpnonce=<?php echo wp_create_nonce("at_sync_forms");?>').then(r=>r.json()).then(d=>{if(d.success){document.getElementById('at-sync-result').textContent='✅ Discovered '+d.data.discovered+' form(s), synced '+d.data.synced+'.';}else{document.getElementById('at-sync-result').textContent='❌ '+(d.data||'Failed');}b.disabled=false;}).catch(()=>{document.getElementById('at-sync-result').textContent='❌ Request failed';b.disabled=false;});});
</script>
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
public static function ajax_test_connection(){check_ajax_referer('at_test','_wpnonce');if(!current_user_can('manage_options')){wp_send_json_error('Unauthorized');}$opts=self::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/track-pageview';$response=wp_remote_post($endpoint,array('timeout'=>10,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode(array('source'=>array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'type'=>'wordpress','plugin_version'=>AT_PLUGIN_VERSION),'event'=>array('page_url'=>home_url(),'event_id'=>'test_'.wp_generate_uuid4(),'session_id'=>'test','title'=>'Connection Test'),'attribution'=>new \\stdClass(),'visitor'=>array('visitor_id'=>'test')))));if(is_wp_error($response)){wp_send_json_error($response->get_error_message());}$code=wp_remote_retrieve_response_code($response);if($code>=200&&$code<300){wp_send_json_success();}else{wp_send_json_error('HTTP '.$code.': '.wp_remote_retrieve_body($response));}}
public static function ajax_sync_forms(){check_ajax_referer('at_sync_forms','_wpnonce');if(!current_user_can('manage_options')){wp_send_json_error('Unauthorized');}$result=AT_Forms::scan_all_forms();if(!empty($result['error'])){wp_send_json_error($result['error']);}wp_send_json_success($result);}
}`,

    "actv-trkr/includes/class-tracker.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Tracker{
public static function init(){add_action('wp_enqueue_scripts',array(__CLASS__,'enqueue'));}
public static function enqueue(){if(is_admin())return;$opts=AT_Settings::get();if($opts['enable_tracking']!=='1'||empty($opts['api_key']))return;wp_enqueue_script('at-tracker',AT_PLUGIN_URL.'assets/tracker.js',array(),AT_PLUGIN_VERSION,true);wp_localize_script('at-tracker','atConfig',array('endpoint'=>rtrim($opts['endpoint_url'],'/').'/track-pageview','apiKey'=>$opts['api_key'],'domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'pluginVersion'=>AT_PLUGIN_VERSION));}
}`,

    "actv-trkr/includes/class-forms.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Forms{
public static function init(){$opts=AT_Settings::get();add_action('rest_api_init',array(__CLASS__,'register_rest_routes'));if(is_admin()&&!empty($opts['api_key'])){add_action('admin_init',array(__CLASS__,'maybe_auto_sync'));}if($opts['enable_forms']!=='1'||empty($opts['api_key']))return;add_action('gform_after_submission',array(__CLASS__,'handle_gravity'),10,2);add_action('wpcf7_mail_sent',array(__CLASS__,'handle_cf7'));add_action('wpforms_process_complete',array(__CLASS__,'handle_wpforms'),10,4);add_action('fusion_form_submission_data',array(__CLASS__,'handle_avada'),10,2);add_action('ninja_forms_after_submission',array(__CLASS__,'handle_ninja'));add_action('fluentform/submission_inserted',array(__CLASS__,'handle_fluent'),10,3);}
public static function register_rest_routes(){register_rest_route('actv-trkr/v1','/sync',array('methods'=>'POST','callback'=>array(__CLASS__,'handle_rest_sync'),'permission_callback'=>'__return_true'));}
public static function handle_rest_sync($request){$opts=AT_Settings::get();if(empty($opts['api_key'])){return new \\WP_REST_Response(array('error'=>'Plugin not configured'),400);} $body=$request->get_json_params();$key_hash=$body['key_hash']??'';$stored_hash=hash('sha256',$opts['api_key']);if(!$key_hash||!hash_equals($stored_hash,$key_hash)){return new \\WP_REST_Response(array('error'=>'Unauthorized'),403);} $result=self::scan_all_forms();return new \\WP_REST_Response(array('ok'=>true,'result'=>$result),200);}
public static function maybe_auto_sync(){if(get_transient('actv_trkr_last_form_sync'))return;self::scan_all_forms();set_transient('actv_trkr_last_form_sync',time(),6*HOUR_IN_SECONDS);}
public static function scan_all_forms(){$discovered=array();
if(class_exists('GFAPI')){$gf=\\GFAPI::get_forms();if(is_array($gf)){foreach($gf as $f){$discovered[]=array('form_id'=>(string)($f['id']??''),'form_title'=>$f['title']??'Gravity Form','provider'=>'gravity_forms');}}}
if(class_exists('WPCF7_ContactForm')){$cf=\\WPCF7_ContactForm::find();if(is_array($cf)){foreach($cf as $f){$discovered[]=array('form_id'=>(string)$f->id(),'form_title'=>$f->title(),'provider'=>'cf7');}}}
if(function_exists('wpforms')&&isset(wpforms()->form)){$wf=wpforms()->form->get('',array('posts_per_page'=>-1));if(is_array($wf)){foreach($wf as $f){$discovered[]=array('form_id'=>(string)$f->ID,'form_title'=>$f->post_title?:'WPForm','provider'=>'wpforms');}}}
if(function_exists('Ninja_Forms')){try{$nf=Ninja_Forms()->form()->get_forms();if(is_array($nf)){foreach($nf as $f){$discovered[]=array('form_id'=>(string)$f->get_id(),'form_title'=>$f->get_setting('title')?:'Ninja Form','provider'=>'ninja_forms');}}}catch(\\Exception $e){error_log('[ACTV TRKR] Ninja Forms scan error: '.$e->getMessage());}}
if(function_exists('wpFluent')){try{$ff=wpFluent()->table('fluentform_forms')->get();if(is_array($ff)||$ff instanceof \\Traversable){foreach($ff as $f){$discovered[]=array('form_id'=>(string)($f->id??''),'form_title'=>$f->title??'Fluent Form','provider'=>'fluent_forms');}}}catch(\\Exception $e){error_log('[ACTV TRKR] Fluent Forms scan error: '.$e->getMessage());}}
$avada_forms=get_posts(array('post_type'=>'fusion_form','post_status'=>'publish','posts_per_page'=>-1,'fields'=>'ids'));if(is_array($avada_forms)&&!empty($avada_forms)){foreach($avada_forms as $fp){$title=get_the_title($fp)?:'Avada Form';$discovered[]=array('form_id'=>(string)$fp,'form_title'=>$title,'provider'=>'avada');}}
if(empty($discovered)){return array('synced'=>0,'discovered'=>0,'trashed'=>0,'restored'=>0);}
$opts=AT_Settings::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/sync-forms';$domain=wp_parse_url(home_url(),PHP_URL_HOST);
$response=wp_remote_post($endpoint,array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode(array('forms'=>$discovered,'domain'=>$domain))));
if(is_wp_error($response)){error_log('[ACTV TRKR] Form sync error: '.$response->get_error_message());return array('synced'=>0,'discovered'=>count($discovered),'trashed'=>0,'restored'=>0,'error'=>$response->get_error_message());}
$body=json_decode(wp_remote_retrieve_body($response),true);$entry_result=self::sync_entry_ids($discovered,$domain,$opts);return array('synced'=>$body['synced']??0,'discovered'=>count($discovered),'trashed'=>$entry_result['trashed']??0,'restored'=>$entry_result['restored']??0);}
public static function sync_entry_ids($discovered,$domain,$opts){$forms_with_entries=array();foreach($discovered as $form_info){$provider=$form_info['provider']??'';$form_id=$form_info['form_id']??'';if(!$form_id)continue;$entry_ids=self::get_active_entry_ids($provider,$form_id);if($entry_ids===null)continue;$forms_with_entries[]=array('form_id'=>$form_id,'provider'=>$provider,'entry_ids'=>$entry_ids);}if(empty($forms_with_entries))return array('trashed'=>0,'restored'=>0);$endpoint=rtrim($opts['endpoint_url'],'/').'/sync-entries';$response=wp_remote_post($endpoint,array('timeout'=>30,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode(array('domain'=>$domain,'forms'=>$forms_with_entries))));if(is_wp_error($response)){error_log('[ACTV TRKR] Entry sync error: '.$response->get_error_message());return array('trashed'=>0,'restored'=>0,'error'=>$response->get_error_message());}$body=json_decode(wp_remote_retrieve_body($response),true);return array('trashed'=>$body['trashed']??0,'restored'=>$body['restored']??0);}
private static function get_active_entry_ids($provider,$form_id){global $wpdb;switch($provider){case 'gravity_forms':if(!class_exists('GFAPI'))return null;$entries=\\GFAPI::get_entries($form_id,array('status'=>'active'),null,array('offset'=>0,'page_size'=>5000));if(!is_array($entries))return array();return array_map(function($e){return (string)($e['id']??'');},$entries);case 'wpforms':if(!function_exists('wpforms')||!isset(wpforms()->entry))return null;$entries=wpforms()->entry->get_entries(array('form_id'=>$form_id));if(!is_array($entries))return array();return array_map(function($e){return (string)$e->entry_id;},$entries);case 'avada':$table=$wpdb->prefix.'fusion_form_submissions';if($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s",$table))!==$table)return null;$rows=$wpdb->get_results($wpdb->prepare("SELECT id FROM {$table} WHERE form_id=%d AND is_read>=0 ORDER BY id DESC LIMIT 5000",intval($form_id)));if(!is_array($rows)||empty($rows))return array();return array_map(function($r){return 'avada_db_'.$r->id;},$rows);default:return null;}}
public static function probe_form_pages(){$opts=AT_Settings::get();if(empty($opts['api_key']))return;$pages=get_posts(array('post_type'=>array('page','post'),'post_status'=>'publish','numberposts'=>50));foreach($pages as $p){$url=get_permalink($p);$resp=wp_remote_get($url,array('timeout'=>10));if(is_wp_error($resp))continue;$body=wp_remote_retrieve_body($resp);if(stripos($body,'<form')!==false){$endpoint=rtrim($opts['endpoint_url'],'/').'/ingest-form-health';wp_remote_post($endpoint,array('timeout'=>10,'headers'=>array('Content-Type'=>'application/json','x-actvtrkr-key'=>$opts['api_key']),'body'=>wp_json_encode(array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'page_url'=>$url,'is_rendered'=>true))));}}}
private static function get_tracking_context(){$vid=isset($_COOKIE['at_vid'])?sanitize_text_field($_COOKIE['at_vid']):null;$sid=isset($_COOKIE['at_sid'])?sanitize_text_field($_COOKIE['at_sid']):null;$utm=isset($_COOKIE['at_utm'])?json_decode(stripslashes($_COOKIE['at_utm']),true):array();if(!is_array($utm))$utm=array();return array('domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'referrer'=>wp_get_referer()?:null,'visitor_id'=>$vid,'session_id'=>$sid,'utm'=>$utm,'plugin_version'=>AT_PLUGIN_VERSION);}
private static function send($payload){$opts=AT_Settings::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/ingest-form';$response=wp_remote_post($endpoint,array('timeout'=>10,'blocking'=>true,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$opts['api_key']),'body'=>wp_json_encode($payload)));if(is_wp_error($response)){error_log('[ACTV TRKR] Form send error: '.$response->get_error_message());AT_Retry_Queue::enqueue($endpoint,$opts['api_key'],$payload);}else{$code=wp_remote_retrieve_response_code($response);if($code>=400){error_log('[ACTV TRKR] Form send HTTP '.$code.': '.wp_remote_retrieve_body($response));}}}
public static function handle_gravity($entry,$form){$fields=array();if(!empty($form['fields'])){foreach($form['fields'] as $field){$fid=$field->id;$value=rgar($entry,(string)$fid);$fields[]=array('id'=>$fid,'name'=>$field->label,'label'=>$field->label,'type'=>$field->type,'value'=>$value);}}self::send(array('provider'=>'gravity_forms','entry'=>array('form_id'=>rgar($entry,'form_id'),'form_title'=>$form['title']??'','entry_id'=>rgar($entry,'id'),'source_url'=>rgar($entry,'source_url'),'submitted_at'=>rgar($entry,'date_created')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_cf7($cf){$sub=WPCF7_Submission::get_instance();if(!$sub)return;$posted=$sub->get_posted_data();$fields=array();foreach($posted as $k=>$v){if(strpos($k,'_wpcf7')===0)continue;$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}self::send(array('provider'=>'cf7','entry'=>array('form_id'=>$cf->id(),'form_title'=>$cf->title(),'entry_id'=>'cf7_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_wpforms($fields_raw,$entry,$form_data,$entry_id){$fields=array();foreach($fields_raw as $f){$fields[]=array('id'=>$f['id']??'','name'=>$f['name']??'','label'=>$f['name']??'','type'=>$f['type']??'text','value'=>$f['value']??'');}self::send(array('provider'=>'wpforms','entry'=>array('form_id'=>$form_data['id']??'','form_title'=>$form_data['settings']['form_title']??'','entry_id'=>$entry_id,'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_avada($data,$form_post_id){$fields=array();if(is_array($data)){foreach($data as $k=>$v){$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}}$title='Avada Form';$p=get_post($form_post_id);if($p){$title=$p->post_title?:$title;}self::send(array('provider'=>'avada','entry'=>array('form_id'=>$form_post_id,'form_title'=>$title,'entry_id'=>'avada_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_ninja($form_data){$fields=array();if(!empty($form_data['fields'])){foreach($form_data['fields'] as $f){$fields[]=array('id'=>$f['id']??'','name'=>$f['key']??$f['label']??'','label'=>$f['label']??'','type'=>$f['type']??'text','value'=>$f['value']??'');}}self::send(array('provider'=>'ninja_forms','entry'=>array('form_id'=>$form_data['form_id']??'','form_title'=>$form_data['settings']['title']??'Ninja Form','entry_id'=>'ninja_'.time().'_'.wp_rand(),'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
public static function handle_fluent($entry_id,$form_data,$form){$fields=array();if(is_array($form_data)){foreach($form_data as $k=>$v){if(strpos($k,'_fluentform_')===0||$k==='__fluent_form_embded_post_id')continue;$fields[]=array('name'=>$k,'label'=>$k,'type'=>'text','value'=>is_array($v)?implode(', ',$v):$v);}}self::send(array('provider'=>'fluent_forms','entry'=>array('form_id'=>$form->id??'','form_title'=>$form->title??'Fluent Form','entry_id'=>$entry_id,'source_url'=>wp_get_referer()?:home_url(),'submitted_at'=>current_time('c')),'context'=>self::get_tracking_context(),'fields'=>$fields));}
}`, 

    "actv-trkr/includes/class-retry-queue.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Retry_Queue{
const TABLE='at_retry_queue';const MAX_ATTEMPTS=5;
public static function table_name(){global $wpdb;return $wpdb->prefix.self::TABLE;}
public static function create_table(){global $wpdb;$table=self::table_name();$charset=$wpdb->get_charset_collate();$sql="CREATE TABLE IF NOT EXISTS {$table}(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,endpoint VARCHAR(500) NOT NULL,api_key VARCHAR(500) NOT NULL,payload LONGTEXT NOT NULL,attempts TINYINT UNSIGNED DEFAULT 0,last_error TEXT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,next_retry_at DATETIME DEFAULT CURRENT_TIMESTAMP) {$charset};";require_once ABSPATH.'wp-admin/includes/upgrade.php';dbDelta($sql);}
public static function enqueue($endpoint,$api_key,$payload){global $wpdb;$wpdb->insert(self::table_name(),array('endpoint'=>$endpoint,'api_key'=>$api_key,'payload'=>wp_json_encode($payload)));}
public static function process(){global $wpdb;$table=self::table_name();$now=current_time('mysql');$rows=$wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE attempts < %d AND next_retry_at <= %s ORDER BY created_at ASC LIMIT 20",self::MAX_ATTEMPTS,$now));foreach($rows as $row){$response=wp_remote_post($row->endpoint,array('timeout'=>15,'headers'=>array('Content-Type'=>'application/json','Authorization'=>'Bearer '.$row->api_key),'body'=>$row->payload));$code=is_wp_error($response)?0:wp_remote_retrieve_response_code($response);if($code>=200&&$code<300){$wpdb->delete($table,array('id'=>$row->id));}else{$attempts=(int)$row->attempts+1;$error=is_wp_error($response)?$response->get_error_message():'HTTP '.$code;$delay=min(pow(2,$attempts)*60,3600);$next=gmdate('Y-m-d H:i:s',time()+$delay);$wpdb->update($table,array('attempts'=>$attempts,'last_error'=>$error,'next_retry_at'=>$next),array('id'=>$row->id));}}$wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE attempts >= %d",self::MAX_ATTEMPTS));}
}`,

    "actv-trkr/includes/class-updater.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Updater{
const SLUG='actv-trkr/actv-trkr.php';const TRANSIENT='at_update_data';const CHECK_HOURS=12;
public static function init(){add_filter('pre_set_site_transient_update_plugins',array(__CLASS__,'check_update'));add_filter('plugins_api',array(__CLASS__,'plugin_info'),20,3);add_filter('plugin_row_meta',array(__CLASS__,'row_meta'),10,2);}
private static function endpoint(){$opts=AT_Settings::get();return rtrim($opts['endpoint_url'],'/').'/plugin-update-check';}
public static function check_update($transient){if(empty($transient->checked))return $transient;$remote=self::get_remote_data();if(!$remote||empty($remote['has_update']))return $transient;$package=!empty($remote['download_url'])?$remote['download_url']:'';$transient->response[self::SLUG]=(object)array('slug'=>'actv-trkr','plugin'=>self::SLUG,'new_version'=>$remote['version'],'url'=>'https://actvtrkr.com','package'=>$package,'icons'=>array(),'banners'=>array(),'tested'=>$remote['tested_wp']??'6.7','requires'=>$remote['requires_wp']??'5.8');return $transient;}
public static function plugin_info($result,$action,$args){if($action!=='plugin_information')return $result;if(!isset($args->slug)||$args->slug!=='actv-trkr')return $result;$remote=self::get_remote_info();if(!$remote)return $result;$info=new stdClass();$info->name=$remote['name']??'ACTV TRKR';$info->slug='actv-trkr';$info->version=$remote['version']??AT_PLUGIN_VERSION;$info->author=$remote['author']??'ACTV TRKR';$info->homepage=$remote['homepage']??'https://actvtrkr.com';$info->requires=$remote['requires']??'5.8';$info->tested=$remote['tested']??'6.7';$info->requires_php=$remote['requires_php']??'7.4';$info->download_link=$remote['download_url']??'';$info->sections=array('description'=>$remote['sections']['description']??'','changelog'=>nl2br(esc_html($remote['sections']['changelog']??'')));return $info;}
public static function row_meta($links,$file){if($file!==self::SLUG)return $links;$links[]='<a href="'.esc_url(admin_url('options-general.php?page=actv-trkr')).'">Settings</a>';return $links;}
private static function get_remote_data(){$cached=get_transient(self::TRANSIENT);if($cached!==false)return $cached;$domain=wp_parse_url(home_url(),PHP_URL_HOST);$url=self::endpoint().'?'.http_build_query(array('action'=>'check','version'=>AT_PLUGIN_VERSION,'domain'=>$domain));$response=wp_remote_get($url,array('timeout'=>10));if(is_wp_error($response))return null;$body=json_decode(wp_remote_retrieve_body($response),true);if(!is_array($body))return null;set_transient(self::TRANSIENT,$body,self::CHECK_HOURS*HOUR_IN_SECONDS);return $body;}
private static function get_remote_info(){$url=self::endpoint().'?action=info';$response=wp_remote_get($url,array('timeout'=>10));if(is_wp_error($response))return null;return json_decode(wp_remote_retrieve_body($response),true);}
}`,

    "actv-trkr/includes/class-gravity.php": `<?php
if(!defined('ABSPATH'))exit;
// DEPRECATED: Form capture is now handled by class-forms.php.
`,

    "actv-trkr/assets/tracker.js": `(function(){'use strict';if(typeof window==='undefined'||typeof document==='undefined')return;if(!window.atConfig)return;var CFG=window.atConfig;var COOKIE_VID='at_vid';var COOKIE_SID='at_sid';var COOKIE_UTM='at_utm';var COOKIE_TS='at_ts';var SESSION_TIMEOUT=30*60*1000;var HEARTBEAT_INTERVAL=10000;var MAX_EVENTS_PER_SESSION=200;
function setCookie(n,v,d){var e=new Date();e.setTime(e.getTime()+d*864e5);document.cookie=n+'='+encodeURIComponent(v)+';expires='+e.toUTCString()+';path=/;SameSite=Lax';}
function getCookie(n){var v=document.cookie.match('(^|;)\\\\s*'+n+'=([^;]*)');return v?decodeURIComponent(v[2]):null;}
function uuid(){if(crypto&&crypto.randomUUID)return crypto.randomUUID();return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=(Math.random()*16)|0;return(c==='x'?r:(r&0x3)|0x8).toString(16);});}
function getUtms(){var p=new URLSearchParams(window.location.search);var keys=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];var out={};var f=false;keys.forEach(function(k){var v=p.get(k);if(v){out[k]=v;f=true;}});return f?out:null;}
function storedUtms(){var r=getCookie(COOKIE_UTM);if(!r)return{};try{return JSON.parse(r);}catch(e){return{};}}
function utmsChanged(nu){if(!nu)return false;var old=storedUtms();return['utm_source','utm_medium','utm_campaign'].some(function(k){return(nu[k]||'')!==(old[k]||'');});}
function resolveSession(urlUtms){var sid=getCookie(COOKIE_SID);var lastTs=parseInt(getCookie(COOKIE_TS)||'0',10);var now=Date.now();var expired=!sid||!lastTs||(now-lastTs>SESSION_TIMEOUT);var utmSwitch=urlUtms&&utmsChanged(urlUtms);if(expired||utmSwitch){sid=uuid();}setCookie(COOKIE_SID,sid,1);setCookie(COOKIE_TS,String(now),1);return sid;}
function deviceType(){var w=window.innerWidth;if(w<768)return'mobile';if(w<1024)return'tablet';return'desktop';}
function send(endpoint,payload){var body=JSON.stringify(payload);fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+CFG.apiKey},body:body,keepalive:true}).catch(function(){try{navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}catch(e){}});}
function sendBeaconSafe(endpoint,payload){var body=JSON.stringify(payload);try{if(navigator.sendBeacon){navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));}else{var xhr=new XMLHttpRequest();xhr.open('POST',endpoint,false);xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('Authorization','Bearer '+CFG.apiKey);xhr.send(body);}}catch(e){}}
var pageTimer={startedAt:null,activeMs:0,lastResumeAt:null,isActive:true,eventId:null,heartbeatTimer:null,start:function(eventId){this.eventId=eventId;this.startedAt=Date.now();this.lastResumeAt=Date.now();this.activeMs=0;this.isActive=true;this.startHeartbeat();},pause:function(){if(this.isActive&&this.lastResumeAt){this.activeMs+=Date.now()-this.lastResumeAt;this.isActive=false;}},resume:function(){if(!this.isActive){this.lastResumeAt=Date.now();this.isActive=true;}},getActiveSeconds:function(){var total=this.activeMs;if(this.isActive&&this.lastResumeAt){total+=Date.now()-this.lastResumeAt;}return Math.round(total/1000);},startHeartbeat:function(){var self=this;this.heartbeatTimer=setInterval(function(){if(self.isActive){self.sendTimeUpdate();}},HEARTBEAT_INTERVAL);},sendTimeUpdate:function(){if(!this.eventId)return;var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);send(CFG.endpoint,{type:'time_update',api_key:CFG.apiKey,source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},event:{event_id:this.eventId,session_id:sid,active_seconds:this.getActiveSeconds()},visitor:{visitor_id:vid}});},sendFinal:function(){if(!this.eventId)return;clearInterval(this.heartbeatTimer);var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);sendBeaconSafe(CFG.endpoint,{type:'time_update',api_key:CFG.apiKey,source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},event:{event_id:this.eventId,session_id:sid,active_seconds:this.getActiveSeconds()},visitor:{visitor_id:vid}});}};
document.addEventListener('visibilitychange',function(){if(document.hidden){pageTimer.pause();}else{pageTimer.resume();}});
window.addEventListener('beforeunload',function(){pageTimer.sendFinal();flushEventBatch();});
var eventBatch=[];var sessionEventCount=0;var batchTimer=null;
var DOWNLOAD_EXTENSIONS=/\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt|rtf|mp3|mp4|avi|mov|epub)$/i;
function classifyClick(el){if(!el)return null;var target=el;for(var i=0;i<5&&target;i++){var tag=(target.tagName||'').toLowerCase();if(target.getAttribute&&target.getAttribute('data-actv')==='cta'){return{type:'cta_click',text:getClickText(target),el:target};}if(tag==='a'){var href=target.getAttribute('href')||'';if(href.indexOf('tel:')===0){return{type:'tel_click',text:href.replace('tel:',''),el:target};}if(href.indexOf('mailto:')===0){return{type:'mailto_click',text:href.replace('mailto:',''),el:target};}if(DOWNLOAD_EXTENSIONS.test(href)){return{type:'download_click',text:getClickText(target)||href.split('/').pop(),el:target};}try{var linkHost=new URL(href,window.location.origin).hostname;if(linkHost&&linkHost!==window.location.hostname){return{type:'outbound_click',text:getClickText(target)||linkHost,el:target};}}catch(e){}}if(tag==='button'||(target.getAttribute&&target.getAttribute('role')==='button')){var inForm=target.closest&&target.closest('form');var btnType=(target.getAttribute('type')||'').toLowerCase();if(!inForm||btnType!=='submit'){return{type:'cta_click',text:getClickText(target),el:target};}}target=target.parentElement;}return null;}
function getClickText(el){var text=(el.innerText||el.textContent||'').trim();if(text.length>100)text=text.substring(0,100);return text||el.getAttribute('aria-label')||el.getAttribute('title')||'';}
function trackClick(e){if(sessionEventCount>=MAX_EVENTS_PER_SESSION)return;var result=classifyClick(e.target);if(!result)return;sessionEventCount++;var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);eventBatch.push({event_type:result.type,target_text:result.text,page_url:window.location.href,page_path:window.location.pathname,timestamp:new Date().toISOString(),session_id:sid,visitor_id:vid});if(!batchTimer){batchTimer=setTimeout(flushEventBatch,HEARTBEAT_INTERVAL);}}
function flushEventBatch(){clearTimeout(batchTimer);batchTimer=null;if(eventBatch.length===0)return;var events=eventBatch.splice(0);var eventEndpoint=CFG.endpoint.replace(/\\/track-pageview$/,'/track-event');sendBeaconSafe(eventEndpoint,{api_key:CFG.apiKey,source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},events:events});}
function trackFormFocus(e){if(sessionEventCount>=MAX_EVENTS_PER_SESSION)return;var el=e.target;if(!el||!el.closest)return;var form=el.closest('form');if(!form)return;if(form._atFormStarted)return;form._atFormStarted=true;sessionEventCount++;var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);eventBatch.push({event_type:'form_start',target_text:form.getAttribute('data-form-title')||form.getAttribute('aria-label')||form.getAttribute('id')||'form',page_url:window.location.href,page_path:window.location.pathname,timestamp:new Date().toISOString(),session_id:sid,visitor_id:vid});if(!batchTimer){batchTimer=setTimeout(flushEventBatch,HEARTBEAT_INTERVAL);}}
document.addEventListener('click',trackClick,true);document.addEventListener('focusin',trackFormFocus,true);
function track(){var vid=getCookie(COOKIE_VID);if(!vid){vid=uuid();setCookie(COOKIE_VID,vid,365);}var urlUtms=getUtms();if(urlUtms){setCookie(COOKIE_UTM,JSON.stringify(urlUtms),30);}var sid=resolveSession(urlUtms);var attribution=Object.assign({},storedUtms(),urlUtms||{});var eventId=uuid();pageTimer.start(eventId);send(CFG.endpoint,{source:{domain:CFG.domain,type:'wordpress',plugin_version:CFG.pluginVersion},event:{event_id:eventId,session_id:sid,page_url:window.location.href,page_path:window.location.pathname,title:document.title,referrer:document.referrer||null,device:deviceType(),occurred_at:new Date().toISOString()},attribution:attribution,visitor:{visitor_id:vid}});}
var SKIP_NAMES=['_wpnonce','_wp_http_referer','_wpcf7','_wpcf7_version','_wpcf7_locale','_wpcf7_unit_tag','_wpcf7_container_post','action','gform_ajax','gform_field_values','is_submit','gform_submit','gform_unique_id','gform_target_page_number','gform_source_page_number'];
var SKIP_PAT=[/^_/,/nonce/i,/token/i,/csrf/i,/captcha/i,/^g-recaptcha/,/^h-captcha/,/^cf-turnstile/];
var SENS_PAT=[/password/i,/passwd/i,/cc[-_]?num/i,/card[-_]?number/i,/cvv/i,/cvc/i,/ssn/i,/social[-_]?security/i,/credit[-_]?card/i];
function skipField(n,t){if(!n)return true;if(t==='password'||t==='hidden')return true;if(SKIP_NAMES.indexOf(n)!==-1)return true;for(var i=0;i<SKIP_PAT.length;i++){if(SKIP_PAT[i].test(n))return true;}return false;}
function isSens(n){for(var i=0;i<SENS_PAT.length;i++){if(SENS_PAT[i].test(n))return true;}return false;}
function captureForm(form){var fields=[];var els=form.elements;var seen={};for(var i=0;i<els.length;i++){var el=els[i];var name=el.name||el.id||'';var type=(el.type||'text').toLowerCase();if(skipField(name,type))continue;if(seen[name])continue;var value='';if(type==='checkbox'){var chk=form.querySelectorAll('input[name="'+name+'"]:checked');var vals=[];for(var j=0;j<chk.length;j++)vals.push(chk[j].value);value=vals.join(', ');}else if(type==='radio'){var sel=form.querySelector('input[name="'+name+'"]:checked');value=sel?sel.value:'';}else if(el.tagName==='SELECT'){var opts=el.selectedOptions||[];var sv=[];for(var k=0;k<opts.length;k++)sv.push(opts[k].value);value=sv.join(', ');}else{value=el.value||'';}seen[name]=true;if(isSens(name)){value='[REDACTED]';}if(value===''&&type!=='checkbox')continue;fields.push({name:name,label:el.getAttribute('aria-label')||el.getAttribute('placeholder')||name,type:type,value:value});}return fields;}
document.addEventListener('submit',function(e){var form=e.target;if(!form||form.tagName!=='FORM')return;if(form.getAttribute('data-at-ignore')==='true')return;var role=form.getAttribute('role');if(role==='search')return;var action=(form.getAttribute('action')||'').toLowerCase();if(action.indexOf('wp-login')!==-1||action.indexOf('wp-admin')!==-1)return;var fields=captureForm(form);if(fields.length===0)return;var vid=getCookie(COOKIE_VID);var sid=getCookie(COOKIE_SID);var formEndpoint=CFG.endpoint.replace(/\\/track-pageview$/,'/ingest-form');send(formEndpoint,{provider:'js_capture',entry:{form_id:form.getAttribute('id')||form.getAttribute('data-form-id')||'dom_form',form_title:form.getAttribute('data-form-title')||form.getAttribute('aria-label')||document.title,entry_id:'js_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),source_url:window.location.href,page_url:window.location.href,submitted_at:new Date().toISOString()},context:{domain:CFG.domain,referrer:document.referrer||null,visitor_id:vid,session_id:sid,utm:storedUtms(),plugin_version:CFG.pluginVersion},fields:fields});},true);
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',track);}else{track();}})();`,

    "actv-trkr/includes/class-heartbeat.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Heartbeat{
public static function init(){$opts=AT_Settings::get();if(empty($opts['api_key']))return;if(empty($opts['enable_heartbeat'])||$opts['enable_heartbeat']!=='1')return;add_action('wp_enqueue_scripts',array(__CLASS__,'enqueue_beacon'));}
public static function enqueue_beacon(){if(is_admin())return;$opts=AT_Settings::get();wp_enqueue_script('at-heartbeat',AT_PLUGIN_URL.'assets/heartbeat.js',array(),AT_PLUGIN_VERSION,true);wp_localize_script('at-heartbeat','atHeartbeat',array('endpoint'=>rtrim($opts['endpoint_url'],'/').'/ingest-heartbeat','apiKey'=>$opts['api_key'],'domain'=>wp_parse_url(home_url(),PHP_URL_HOST),'interval'=>60000));}
public static function send_cron_heartbeat(){$opts=AT_Settings::get();if(empty($opts['api_key']))return;if(empty($opts['enable_heartbeat'])||$opts['enable_heartbeat']!=='1')return;$endpoint=rtrim($opts['endpoint_url'],'/').'/ingest-heartbeat';$domain=wp_parse_url(home_url(),PHP_URL_HOST);wp_remote_post($endpoint,array('timeout'=>10,'headers'=>array('Content-Type'=>'application/json','x-actvtrkr-key'=>$opts['api_key']),'body'=>wp_json_encode(array('domain'=>$domain,'source'=>'cron','meta'=>array('php_version'=>PHP_VERSION,'wp_version'=>get_bloginfo('version'))))));}
}`,

    "actv-trkr/includes/class-broken-links.php": `<?php
if(!defined('ABSPATH'))exit;
class AT_Broken_Links{
const MAX_PAGES=200;
public static function init(){add_action('wp_ajax_at_scan_broken_links',array(__CLASS__,'ajax_scan'));add_action('at_broken_links_cron',array(__CLASS__,'scan_and_report'));if(!wp_next_scheduled('at_broken_links_cron')){wp_schedule_event(time(),'weekly','at_broken_links_cron');}}
public static function ajax_scan(){check_ajax_referer('at_scan_links','_wpnonce');if(!current_user_can('manage_options')){wp_send_json_error('Unauthorized');}$result=self::scan_and_report();if(isset($result['error'])){wp_send_json_error($result['error']);}wp_send_json_success($result);}
public static function scan_and_report(){$pages=self::get_pages_from_sitemap();if(empty($pages)){$pages=self::get_pages_from_db();}$broken=array();$checked=0;foreach(array_slice($pages,0,self::MAX_PAGES) as $page_url){$response=wp_remote_get($page_url,array('timeout'=>10,'redirection'=>3));if(is_wp_error($response))continue;$body=wp_remote_retrieve_body($response);if(empty($body))continue;$links=self::extract_links($body,$page_url);$checked++;foreach($links as $link){$link_resp=wp_remote_head($link,array('timeout'=>5,'redirection'=>3));if(is_wp_error($link_resp)){$broken[]=array('source_page'=>$page_url,'broken_url'=>$link,'status_code'=>0);continue;}$code=wp_remote_retrieve_response_code($link_resp);if($code>=400){$broken[]=array('source_page'=>$page_url,'broken_url'=>$link,'status_code'=>$code);}}}if(empty($broken)){return array('pages_checked'=>$checked,'broken_found'=>0);}$opts=AT_Settings::get();$endpoint=rtrim($opts['endpoint_url'],'/').'/ingest-broken-links';$domain=wp_parse_url(home_url(),PHP_URL_HOST);wp_remote_post($endpoint,array('timeout'=>30,'headers'=>array('Content-Type'=>'application/json','x-actvtrkr-key'=>$opts['api_key']),'body'=>wp_json_encode(array('domain'=>$domain,'links'=>$broken))));return array('pages_checked'=>$checked,'broken_found'=>count($broken));}
private static function get_pages_from_sitemap(){$sitemap_url=home_url('/sitemap.xml');$response=wp_remote_get($sitemap_url,array('timeout'=>10));if(is_wp_error($response))return array();$body=wp_remote_retrieve_body($response);preg_match_all('/<loc>(.*?)<\\/loc>/',$body,$matches);return $matches[1]??array();}
private static function get_pages_from_db(){$posts=get_posts(array('post_type'=>array('page','post'),'post_status'=>'publish','numberposts'=>self::MAX_PAGES));return array_map(function($p){return get_permalink($p);},$posts);}
private static function extract_links($html,$page_url){$host=wp_parse_url(home_url(),PHP_URL_HOST);preg_match_all('/href=["\\']([ ^"\\' ]+)["\\']/',$html,$matches);$links=array();foreach($matches[1] as $href){if(strpos($href,'#')===0||strpos($href,'mailto:')===0||strpos($href,'tel:')===0)continue;if(strpos($href,'javascript:')===0)continue;if(strpos($href,'/')===0){$href=home_url($href);}$link_host=wp_parse_url($href,PHP_URL_HOST);if($link_host&&$link_host!==$host)continue;$links[]=$href;}return array_unique(array_slice($links,0,50));}
}`,

    "actv-trkr/assets/heartbeat.js": `(function(){'use strict';if(typeof window==='undefined'||!window.atHeartbeat)return;var CFG=window.atHeartbeat;var sent=false;function sendHeartbeat(){if(sent)return;sent=true;var body=JSON.stringify({domain:CFG.domain,source:'js',meta:{user_agent:navigator.userAgent}});fetch(CFG.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-actvtrkr-key':CFG.apiKey},body:body,keepalive:true}).catch(function(){try{navigator.sendBeacon(CFG.endpoint,new Blob([body],{type:'application/json'}));}catch(e){}});}setTimeout(sendHeartbeat,2000);})();`,

    "actv-trkr/readme.txt": `=== ACTV TRKR ===
Contributors: actvtrkr
Tags: analytics, tracking, forms, leads, pageviews
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: ${PLUGIN_VERSION}
License: GPL-2.0-or-later

First-party pageview tracking and universal form capture for ACTV TRKR.

== Description ==
ACTV TRKR connects your WordPress site to your ACTV TRKR dashboard.
Paste your API key in Settings → ACTV TRKR and tracking starts automatically.

Supports all form plugins: Gravity Forms, Contact Form 7, WPForms, Avada/Fusion Forms, Ninja Forms, Fluent Forms, and any standard HTML form.

== Installation ==
1. Upload the plugin zip to WordPress (Plugins → Add New → Upload Plugin)
2. Activate the plugin
3. Go to Settings → ACTV TRKR and paste your API key
4. That's it! Tracking starts automatically.

== Changelog ==
= 1.3.0 =
* Active time-on-page tracking with focus-aware heartbeats
* Intent-based click tracking (CTAs, downloads, outbound links)
* Form liveness monitoring (hourly probe for rendered forms)
* Broken link scanning improvements

= 1.2.0 =
* Added self-hosted auto-update support
* WordPress admin will now show update notifications automatically

= 1.1.0 =
* Universal form capture (CF7, WPForms, Avada, Ninja, Fluent)
* Retry queue for failed submissions
* Pre-configured API key on download

= 1.0.0 =
* Initial release`,
  };
}
